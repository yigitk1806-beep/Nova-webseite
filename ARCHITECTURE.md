# ONYX – Architektur

> Status: v0.2 · Stand: 2026-11-05
> Phase 1 (Core, Tenancy, Auth, Permissions, Audit) ist implementiert. Die übrigen Module beschreiben die **Zielarchitektur**.

---

## 1. Audit des Bestands

| Bereich | Befund |
|---|---|
| Projektstruktur | **Leer.** Das Repository `yigitk1806-beep/Nova-webseite` enthält keine Commits, keine Branches, keine Dateien. |
| Komponenten | Keine vorhanden |
| Datenbank / Datenmodelle | Keine vorhanden (kein Prisma-Schema, keine Migrationen) |
| API-Routen | Keine vorhanden |
| Authentifizierung | Keine vorhanden |
| Designsystem | Keines vorhanden (keine Tailwind-Konfiguration, keine Tokens) |
| Implementierte Funktionen | Keine |
| Technische Schulden | Keine (nichts Bestehendes). Risiko: Der Repo-Name „Nova-webseite“ passt nicht zum Produkt „ONYX“ → Umbenennung empfohlen. |
| Fehlende Infrastruktur | Alles: Projekt-Setup, CI/CD, Datenbank, Redis, Secrets-Management, Logging, Monitoring, Tests, Deployment |

**Konsequenz:** Es gibt keine Komponenten zum Übernehmen. Wir starten auf grüner Wiese und haben damit die Chance, Mandantenfähigkeit, Audit und Berechtigungen **von Anfang an** einzubauen, statt sie später nachzurüsten.

---

## 2. Architekturprinzipien

1. **Modularer Monolith zuerst.** Eine Next.js-App plus ein separater Worker-Prozess. Die Module sind über klare Schnittstellen getrennt (`packages/*`), damit sie sich später als Services herauslösen lassen. Microservices am Anfang würden Komplexität ohne Nutzen bringen.
2. **Tenant-Isolation by default.** Jede fachliche Tabelle hat `tenantId`. Der Datenzugriff läuft ausschließlich über einen tenant-gebundenen Repository-Layer. Zusätzlich setzt PostgreSQL Row-Level-Security (RLS) als zweite Verteidigungslinie.
3. **Deny by default.** Jede Aktion (Mensch oder Agent) läuft durch die Permission-Prüfung.
4. **Alles ist auditierbar.** Jede schreibende Aktion erzeugt einen Audit-Eintrag, und jeder Agentenschritt wird als Run/Step persistiert.
5. **Agenten handeln nie direkt.** Agenten schlagen über *Tools* Aktionen vor. Die Tool-Schicht prüft Berechtigung, Risiko und Freigabe und führt erst dann aus.
6. **Asynchron, wo es dauert.** LLM-Aufrufe, Workflows und Integrationen laufen über eine Job-Queue (Redis/BullMQ), nicht im HTTP-Request.
7. **Ehrlichkeit im Produkt.** Nicht fertige Features werden im UI als „nicht verfügbar“ markiert und nicht simuliert.

---

## 3. Systemübersicht

```
┌──────────────────────────────────────────────────────────────────────┐
│                         apps/web  (Next.js 16)                        │
│  UI (React, Tailwind, Framer Motion)   │   Route Handlers / Server    │
│  App Router, Server Components         │   Actions  (/api/v1/*)       │
└───────────────┬──────────────────────────────────┬───────────────────┘
                │                                  │
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           ONYX Core (packages/core)                   │
│  Request-Kontext (tenant, actor) · Permission-Guard · Audit-Logger    │
│  Service-Registry · Fehler-Typen · Event-Bus (domain events)          │
└──────┬──────────┬──────────┬───────────┬───────────┬─────────────────┘
       │          │          │           │           │
       ▼          ▼          ▼           ▼           ▼
   Tenant    Permission   Agent       Workflow    Integration    Analytics
   Mgmt      System       Engine      Engine      Layer          Engine
       │          │          │           │           │              │
       └──────────┴──────────┴─────┬─────┴───────────┴──────────────┘
                                   ▼
                ┌───────────────────────────────────────┐
                │ PostgreSQL (Prisma, RLS) │ Redis       │
                │  Daten, Audit, Runs      │ Queue/Cache │
                └───────────────────────────────────────┘
                                   ▲
                ┌──────────────────┴────────────────────┐
                │ apps/worker (Node, BullMQ)            │
                │ Agent-Runs · Workflow-Steps · Sync    │
                └──────────────────┬────────────────────┘
                                   ▼
                 Anthropic API · n8n · externe APIs
```

---

## 4. Module

### 4.1 ONYX Core (`packages/core`)
Zentrale Steuerung und Querschnittsfunktionen.
- `RequestContext`: `{ tenantId, actor: { type: 'user' | 'agent' | 'system', id }, requestId }`, über AsyncLocalStorage verfügbar.
- `withGuard(permission, handler)`: Wrapper für alle Route Handler und Server Actions. Er übernimmt Auth, Tenant-Auflösung, Permission-Prüfung, Validierung (Zod), Fehler-Mapping und Audit.
- Fehlerhierarchie: `OnyxError` → `NotFound`, `Forbidden`, `ValidationError`, `ApprovalRequired`, `ExternalServiceError`.
- Domain-Events (in-process, später Outbox-Pattern) zur Entkopplung der Module.

### 4.2 Agent Engine (`packages/agents`)
Definition, Versionierung und Ausführung von KI-Agenten auf Basis der Anthropic API mit Tool Use. Details: [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md).

### 4.3 Workflow Engine (`packages/workflows`)
- Workflows sind gerichtete Schritt-Graphen (DAG), versioniert als JSON-Definition.
- Schritttypen: `agent`, `tool`, `condition`, `approval`, `wait`, `webhook`, `n8n`.
- Trigger: manuell, Zeitplan (cron), Webhook, Domain-Event.
- Ausführung im Worker. Jeder Schritt ist idempotent und wird persistiert (`WorkflowRun`, `WorkflowStepRun`).
- **n8n-Abgrenzung:** n8n ist ein *externer* Automatisierungs-Executor für Integrationen, die n8n bereits gut abdeckt. ONYX bleibt Quelle der Wahrheit für Berechtigung, Freigabe und Audit. n8n wird nur über signierte Webhooks angesprochen und ruft ONYX nur über tenant-gebundene API-Keys zurück.

### 4.4 Integration Layer (`packages/integrations`)
- Einheitliches Connector-Interface: `connect`, `refresh`, `execute(action, input)`, `describeActions()`.
- Zugangsdaten werden verschlüsselt gespeichert (AES-256-GCM, Envelope Encryption, Schlüssel aus KMS/ENV), nie im Klartext und nie im Frontend.
- Jede Connector-Aktion trägt eine Risikoklasse (`read`, `write`, `external_communication`, `financial`, `destructive`), die in die Freigabelogik einfließt.
- Eingehende Webhooks werden per HMAC-Signatur geprüft und auf Replay-Schutz kontrolliert.

### 4.5 Tenant Management (`packages/tenancy`)
- `Tenant` = Unternehmen; Nutzer sind über `Membership` (n:m) mit Rollen zugeordnet.
- Tenant-Auflösung über Session (aktiver Tenant), später zusätzlich über Subdomain.
- Datenisolation: Prisma-Client-Extension erzwingt `tenantId` in jeder Query. PostgreSQL RLS über `SET app.tenant_id` pro Transaktion.
- Pro Tenant: Einstellungen, Datenregion, Aufbewahrungsfristen, LLM-Budget.

### 4.6 Permission System (`packages/permissions`)
- RBAC mit festen Systemrollen (`owner`, `admin`, `member`, `viewer`) plus tenant-eigenen Rollen.
- Berechtigungen als Strings `ressource:aktion` (z. B. `agent:run`, `workflow:edit`, `integration:execute`).
- Agenten erhalten eine **eigene Identität** mit expliziten, eng gefassten Berechtigungen. Sie können nie mehr als der auslösende Nutzer.
- Freigaberegeln (Approval Policies): „Aktionen der Risikoklasse X erfordern Freigabe durch Rolle Y“.

### 4.7 Audit System (`packages/audit`)
- Append-only-Tabelle `AuditLog`, Schreibzugriff nur über den Audit-Service, kein Update/Delete auf App-Ebene (DB-Rechte entsprechend).
- Hash-Kette (`prevHash`, `hash`) pro Tenant zur Manipulationserkennung.
- Erfasst: Akteur, Aktion, Ressource, Vorher/Nachher-Diff (personenbezogene Daten minimiert), Ergebnis, Request-ID, Agent-Run-Referenz.

### 4.8 Analytics Engine (`packages/analytics`)
- Phase 1: Betriebskennzahlen aus eigenen Daten (Agent-Runs, Erfolgsquote, Tokenverbrauch und Kosten, Workflow-Durchlaufzeiten, offene Freigaben).
- Später: Unternehmens-KPIs aus Integrationen, aggregiert in Materialized Views. Rohdaten-Events kommen in `AnalyticsEvent`.

---

## 5. Repository-Struktur (Ziel)

```
onyx/
├── apps/
│   ├── web/                 # Next.js 16 (App Router): UI + API
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── (auth)/
│   │   │   ├── (app)/[tenant]/…   # Dashboard, Agents, Workflows, Audit …
│   │   │   └── api/v1/…           # Route Handler (dünn, rufen Services)
│   │   ├── components/      # UI-Komponenten (Designsystem)
│   │   └── proxy.ts         # Next 16: Auth-/Tenant-Vorprüfung
│   └── worker/              # BullMQ-Worker: Agents, Workflows, Sync
├── packages/
│   ├── core/  tenancy/  permissions/  audit/
│   ├── agents/  workflows/  integrations/  analytics/
│   ├── db/                  # Prisma-Schema, Client, Migrationen, RLS-SQL
│   ├── ui/                  # Designsystem (Tokens, Primitives)
│   └── config/              # tsconfig, eslint, env-Schema (Zod)
├── docs/
└── docker-compose.yml       # Postgres, Redis, n8n (lokal)
```

Tooling: pnpm Workspaces, TypeScript `strict` (inkl. `noUncheckedIndexedAccess`), ESLint, Prettier, Vitest. Turborepo wird ergänzt, sobald Build-Zeiten es rechtfertigen.

**Umsetzungsstand Phase 1 (Abweichungen vom Ziel):**
- UI-Primitives liegen vorerst in `apps/web/components/ui`. Sie wandern nach `packages/ui`, sobald eine zweite App sie nutzt.
- `packages/agents`, `workflows`, `integrations`, `analytics` existieren noch nicht (Phasen 2–5).

---

## 6. Frontend / Backend-Trennung

- **UI-Komponenten greifen nie direkt auf Prisma zu.** Sie rufen Server Actions oder `/api/v1`, und diese delegieren an `packages/*`-Services.
- Services sind framework-unabhängig (kein Import von `next/*`), dadurch testbar und im Worker wiederverwendbar.
- Öffentliche API (`/api/v1`) ist versioniert, Zod-validiert und per OpenAPI dokumentiert.
- Ein Modul `server-only` verhindert, dass Server-Code ins Client-Bundle gelangt.

## 7. Designsystem (Ziel)

- Tailwind CSS v4 mit Design-Tokens als CSS-Variablen (Farben, Radius, Spacing, Typografie), Dark Mode als Standard („Onyx“-Ästhetik: tiefes Schwarz, hoher Kontrast, ein Akzent).
- Primitives in `packages/ui` (Button, Input, Dialog, Table, Badge, Toast), barrierefrei nach WCAG 2.1 AA.
- Framer Motion nur für bedeutungstragende Übergänge. `prefers-reduced-motion` wird respektiert.

## 8. Querschnitt

| Thema | Lösung |
|---|---|
| Konfiguration | `packages/config/env.ts`: Zod-validiertes ENV, App startet nicht bei fehlenden Werten |
| Logging | Strukturiertes JSON-Logging (pino), `requestId`/`tenantId`/`runId` in jeder Zeile, PII-Redaction |
| Observability | OpenTelemetry-Traces (Request → Job → LLM-Call), Fehler-Tracking |
| Rate Limiting | Redis-basiert pro Tenant/Nutzer/API-Key |
| Tests | Unit (Vitest), Integration gegen echte Postgres (Testcontainers), E2E (Playwright), Tenant-Isolationstests als Pflicht |
| CI | GitHub Actions: typecheck, lint, test, prisma migrate diff, Build |
| Deployment | Container-basiert (Web + Worker getrennt skalierbar), Hosting in der EU |

## 9. Architekturentscheidungen (Kurz-ADRs)

| # | Entscheidung | Begründung |
|---|---|---|
| ADR-1 | Modularer Monolith + Worker statt Microservices | Kleines Team, schnelle Iteration, klare Modulgrenzen erlauben späteres Herauslösen |
| ADR-2 | Shared DB, `tenantId`-Spalte + RLS | Skaliert bis tausende Tenants. Schema-pro-Tenant erst bei Enterprise-Bedarf |
| ADR-3 | BullMQ auf Redis als Queue | Bewährt, Retries/Backoff/Delays, passt zum Stack |
| ADR-4 | Eigene Agent-Runtime auf Anthropic Messages API (Tool Use) | Volle Kontrolle über Berechtigungen, Freigaben und Audit pro Tool-Aufruf |
| ADR-5 | n8n nur als externer Executor | ONYX behält Hoheit über Governance |
| ADR-6 | **Better Auth** (nur Authentifizierung) mit Prisma-Adapter, Passwort-Hashing argon2id, Telemetrie aus | Self-hosted, DSGVO-freundlich. Mandanten, Rollen und Einladungen sind **eigene** Module (nicht das Organization-Plugin), damit RLS, Audit und Eskalationsschutz vollständig in ONYX liegen |
| ADR-7 | RLS mit `ENABLE` (ohne `FORCE`), App verbindet sich als Nicht-Eigentümer `onyx_app` | RLS gilt für die App zwingend. Die Eigentümerrolle bleibt für Migrationen und Wartung (Seed) nutzbar |
