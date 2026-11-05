# ONYX – Agent-Architektur

> Status: v0.2 · Phase 2 (MVP) umgesetzt in `packages/agents`, `apps/worker`, `apps/web/app/t/[slug]/agents`

## 0. Umsetzungsstand Phase 2

| Baustein | Stand |
|---|---|
| Agent Registry (Definition + unveränderliche Versionen) | ✅ inkl. Vorlage „Unternehmensassistent“, Versionshistorie |
| Tool Registry | ✅ 4 lesende Werkzeuge auf ONYX-Daten (Unternehmen, Mitglieder ohne E-Mail, Rollen, Audit) |
| Runtime (manuelle Schleife im Worker, BullMQ `onyx-agents`) | ✅ atomare Übernahme, Persistenz je Schritt, Stop-Gründe inkl. `refusal`/`pause_turn` |
| Policy Gate | ✅ Tool freigegeben? Risikoklasse = READ? Berechtigung? Eingabe valide (Zod)? |
| Effektive Rechte | ✅ Agent-Version ∩ Rechte der auslösenden Person (beim Start ermittelt) |
| LLM Gateway | ✅ Anthropic SDK, Schlüssel nur aus `ANTHROPIC_API_KEY`, Server-Fallback bei Ablehnung (`fallbacks: "default"`, nur Opus 5.5 / Sonnet 5.5 – Haiku 5.5 bietet ihn nicht), Modell-Allowlist (`ONYX_AGENT_MODELS`) |
| Kosten | ✅ Tokens + Kosten je Schritt/Lauf, `UsageRecord` (append-only), Budget je Lauf und Monatsbudget je Unternehmen |
| Kill Switch | ✅ Tenant-Einstellung; bricht laufende Läufe ab, wird vor jedem Modellaufruf geprüft |
| Approval Service | ⏳ Phase 3 – Werkzeuge mit Risikoklasse > READ werden bis dahin verweigert |
| Memory/Wissen (pgvector) | ⏳ später |

Bekannte Grenzen: Ein Lauf, dessen Worker abstürzt, bleibt im Status `RUNNING` (Aufräumjob folgt). Kosten sind eine Schätzung auf Basis der Listenpreise – maßgeblich ist die Anthropic-Abrechnung. Ohne `ANTHROPIC_API_KEY` zeigt die Oberfläche einen Hinweis und startet keine Läufe.

## 1. Grundsatz

Ein ONYX-Agent ist **kein autonomer Prozess mit Vollzugriff**, sondern eine kontrollierte Schleife:

```
LLM denkt → schlägt Tool-Aufruf vor → ONYX prüft (Permission, Risiko, Budget, Freigabe)
         → ONYX führt aus → Ergebnis zurück an LLM → … → Endergebnis
```

Jeder Schritt wird persistiert (`AgentRun`/`AgentStep`). Damit ist jede Agentenaktion lückenlos nachvollziehbar: wer ausgelöst hat, welcher Prompt in welcher Version, welche Tools mit welchen Parametern, welche Freigaben und was es gekostet hat.

## 2. Komponenten

| Komponente | Aufgabe |
|---|---|
| **Agent Registry** | Verwaltet `AgentDefinition` und unveränderliche `AgentVersion`s (Prompt, Modell, Tools, Limits) |
| **Tool Registry** | Typisierte Tools mit Zod-Input-Schema, Risikoklasse, benötigter Permission und Implementierung |
| **Runtime (Executor)** | Führt die Schleife im Worker aus, ruft die Anthropic Messages API mit Tool Use auf |
| **Policy Gate** | Prüft vor jedem Tool-Aufruf: Permission, Risikoklasse, Approval-Policy, Budget, Rate Limit |
| **Approval Service** | Pausiert den Run (`WAITING_APPROVAL`), erstellt `ApprovalRequest` und setzt nach Entscheidung fort |
| **LLM Gateway** | Einziger Ort mit Anthropic-SDK-Zugriff: Retries, Timeouts, Token-Zählung, Kostenerfassung, Modell-Allowlist |
| **Memory/Context** | Phase 2: Kontext pro Run. Später: tenant-gebundenes Wissen (pgvector), strikt tenant-isoliert |

## 3. Tool-Definition (Ziel-Interface)

```ts
interface ToolDefinition<I extends z.ZodTypeAny, O> {
  key: string;                    // "crm.contact.create"
  description: string;            // für das LLM
  input: I;                       // Zod-Schema → JSON-Schema für die API
  riskClass: RiskClass;           // READ | WRITE | EXTERNAL_COMMUNICATION | FINANCIAL | DESTRUCTIVE
  requiredPermission: Permission; // "crm:write"
  idempotent: boolean;
  execute(ctx: ToolContext, input: z.infer<I>): Promise<O>;
}
```

`ToolContext` enthält `tenantId`, Agent-Identität, auslösenden Nutzer, `runId`, tenant-gebundenen DB-Zugriff und Audit-Logger. Tools haben **keinen** globalen DB- oder Netzwerkzugriff außerhalb dieses Kontexts.

## 4. Ausführungsablauf

1. **Auslösung** (UI, API, Workflow, Zeitplan). Permission `agent:run` wird geprüft, `AgentRun(QUEUED)` angelegt, Job in die Queue gestellt, Audit `agent.run.queued`.
2. **Worker** lädt die `AgentVersion` und setzt `RequestContext` (Tenant, Akteur = Agent im Auftrag von Nutzer X).
3. **Schleife** bis `end_turn`, `maxSteps` oder Budgetgrenze:
   - LLM-Aufruf über das Gateway → `AgentStep(LLM_CALL)` mit Tokens und Kosten.
   - Pro `tool_use`-Block:
     - Input gegen Zod validieren (bei Fehler: Fehlermeldung als `tool_result` an das LLM, kein Absturz).
     - **Policy Gate**: Effektive Rechte = Schnittmenge aus Agent-Permissions und Rechten des auslösenden Nutzers.
     - Erfordert die Risikoklasse laut `ApprovalPolicy` eine Freigabe: `ApprovalRequest` mit exaktem Payload und Hash anlegen, Run auf `WAITING_APPROVAL` setzen, Job beenden. Die Freigabe stellt einen neuen Job in die Queue, der den Run fortsetzt.
     - Ausführen → `AgentStep(TOOL_CALL/TOOL_RESULT)` + Audit.
4. **Abschluss** → `SUCCEEDED`/`FAILED`, Output speichern, `UsageRecord` schreiben, Domain-Event `agent.run.finished`.

## 5. Sicherheitsmechanismen

- **Prompt-Injection-Abwehr:** Externe Inhalte (E-Mails, Webseiten, Dokumente) werden als *Daten* markiert in den Kontext gegeben. Die eigentliche Verteidigung sitzt im Policy Gate: Selbst ein manipuliertes LLM kann nur Tools aufrufen, die die Agent-Version erlaubt, und riskante Aktionen brauchen menschliche Freigabe.
- **Least Privilege:** Agenten erhalten nur die Tools, die ihre Version explizit listet.
- **Unveränderliche Freigaben:** Freigegeben wird genau der gespeicherte Payload (Hash-Prüfung bei Ausführung). Ändert das LLM die Parameter, ist eine neue Freigabe nötig.
- **Limits:** `maxSteps`, `maxTokens`, Kostenbudget pro Run und pro Tenant/Monat, Timeout pro Tool.
- **Kill Switch:** Runs sind jederzeit abbrechbar. Tenant-weite Agent-Sperre durch Admins.
- **Keine Secrets im Prompt:** Tools holen Credentials selbst aus dem Integration Layer, das LLM sieht sie nie.

## 6. Modellwahl

Erlaubte Modelle stehen in der Konfiguration (`ONYX_AGENT_MODELS`) und werden pro `AgentVersion` gewählt; zugelassen sind nur Modelle mit hinterlegtem Preis (`packages/agents/src/pricing.ts`). Die Vorlage „Unternehmensassistent“ nutzt aus Kostengründen **Claude Haiku 5.5** mit Effort `low` und 5 US-Cent Limit pro Lauf (typischer Lauf nach Listenpreis ca. 0,04 US-Cent). Opus 5.5 und Sonnet 5.5 sind pro Agent-Version wählbar. Standard: ein leistungsfähiges Modell für komplexe Agenten, ein schnelles und günstiges für Klassifikation und Routing. Der API-Key kommt ausschließlich aus der Umgebung (`ANTHROPIC_API_KEY`) bzw. einem Secret Store.

## 7. Geplante Agententypen (Produkt, nicht Phase 1)

| Agent | Beispiel-Tools | typische Risikoklasse |
|---|---|---|
| Assistent (Q&A über Unternehmensdaten) | `docs.search`, `crm.read` | READ |
| Vertriebsagent | `crm.contact.update`, `email.draft`, `email.send` | WRITE / EXTERNAL_COMMUNICATION |
| Buchhaltungsassistent | `invoice.read`, `invoice.create` | FINANCIAL (immer Freigabe) |
| Support-Agent | `ticket.read`, `ticket.reply` | EXTERNAL_COMMUNICATION |

## 8. Ehrlichkeitsregel

Ein Agent oder Tool gilt erst als verfügbar, wenn es mit echter Integration getestet ist. Platzhalter-Tools werden in der Registry als `status: "unavailable"` geführt und dem LLM **nicht** angeboten.
