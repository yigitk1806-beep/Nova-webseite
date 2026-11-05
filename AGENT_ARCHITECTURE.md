# ONYX – Agent-Architektur

> Status: Entwurf v0.1 · Umsetzung ab Phase 2

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

Modell-IDs sind **nicht hartcodiert**. Erlaubte Modelle stehen in der Konfiguration (Allowlist) und werden pro `AgentVersion` gewählt. Standard: ein leistungsfähiges Modell für komplexe Agenten, ein schnelles und günstiges für Klassifikation und Routing. Der API-Key kommt ausschließlich aus der Umgebung (`ANTHROPIC_API_KEY`) bzw. einem Secret Store.

## 7. Geplante Agententypen (Produkt, nicht Phase 1)

| Agent | Beispiel-Tools | typische Risikoklasse |
|---|---|---|
| Assistent (Q&A über Unternehmensdaten) | `docs.search`, `crm.read` | READ |
| Vertriebsagent | `crm.contact.update`, `email.draft`, `email.send` | WRITE / EXTERNAL_COMMUNICATION |
| Buchhaltungsassistent | `invoice.read`, `invoice.create` | FINANCIAL (immer Freigabe) |
| Support-Agent | `ticket.read`, `ticket.reply` | EXTERNAL_COMMUNICATION |

## 8. Ehrlichkeitsregel

Ein Agent oder Tool gilt erst als verfügbar, wenn es mit echter Integration getestet ist. Platzhalter-Tools werden in der Registry als `status: "unavailable"` geführt und dem LLM **nicht** angeboten.
