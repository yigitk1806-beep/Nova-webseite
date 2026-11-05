# ONYX – Roadmap

> Status: Entwurf v0.1 · Jede Phase wird erst nach expliziter Freigabe begonnen.
> Ausgangslage: Das Repository war leer (siehe ARCHITECTURE.md §1). Es wird nichts übernommen, alles entsteht neu.

## Übersicht

| Phase | Titel | Ergebnis | Status |
|---|---|---|---|
| 0 | Audit & Architektur | Diese Dokumente | ✅ erledigt (zur Freigabe) |
| 1 | Fundament: Core, Tenancy, Auth, Permissions, Audit | Lauffähige, sichere, mandantenfähige Basis ohne KI | ✅ umgesetzt (offen: MFA-Pflicht pro Tenant, s. u.) |
| 2 | Agent Engine (MVP) | Ein echter Agent mit READ-Tools, Run-Protokoll, Kostenerfassung | ✅ umgesetzt (echte Läufe benötigen `ANTHROPIC_API_KEY`) |
| 3 | Approvals & Workflow Engine | Freigabe-Flow, DAG-Workflows, Trigger | geplant |
| 4 | Integration Layer & n8n | Connector-Framework, verschlüsselte Credentials, n8n-Brücke, 1–2 echte Integrationen | geplant |
| 5 | Analytics & DSGVO-Werkzeuge | Dashboards, Export/Löschung, Retention-Jobs | geplant |
| 6 | Härtung & Go-live | Pen-Test, Lasttest, Monitoring, Billing | geplant |

---

## Phase 1 – Fundament (detaillierter Implementierungsplan)

**Ziel:** Ein Nutzer kann sich registrieren, einen Tenant anlegen, Mitglieder einladen und Rollen vergeben. Jede Aktion ist tenant-isoliert, berechtigungsgeprüft und im Audit-Log sichtbar. Noch **keine** KI-Funktion.

### 1.1 Projekt-Setup
- pnpm-Monorepo + Turborepo, Struktur gemäß ARCHITECTURE.md §5
- `apps/web`: Next.js 16 (App Router, TypeScript strict, Tailwind v4)
- `apps/worker`: Skelett mit BullMQ-Verbindung und Health-Check (noch ohne Jobs)
- `docker-compose.yml`: PostgreSQL 16, Redis 7 (n8n erst in Phase 4)
- `packages/config`: Zod-validiertes ENV, `.env.example`
- ESLint, Prettier, Vitest, Playwright, Husky/lint-staged
- GitHub Actions: install → typecheck → lint → test → build

### 1.2 Datenbank
- `packages/db`: Prisma-Schema für die [P1]-Modelle aus DATABASE_SCHEMA.md
- Erste Migration + RLS-SQL-Migration, getrennte DB-Rollen (migrator/app)
- Prisma-Extension „tenant-scoped client“ inkl. `SET LOCAL app.tenant_id`
- Seed: Systemrollen + Permission-Katalog

### 1.3 ONYX Core
- `RequestContext` (AsyncLocalStorage), Fehlerhierarchie, pino-Logger mit Redaction
- `withGuard()` für Route Handler und Server Actions (Auth → Tenant → Permission → Zod → Audit → Fehler-Mapping)

### 1.4 Authentifizierung
- Auth-Bibliothek festlegen (Auth.js v5 vs. Better Auth, kurze Evaluierung als ADR)
- E-Mail/Passwort (argon2id) + E-Mail-Verifikation, Session-Cookies, `proxy.ts` für geschützte Routen
- MFA (TOTP) für Owner/Admins **optional in 1, Pflicht vor Go-live**

### 1.5 Tenant Management & Permissions
- Tenant anlegen, wechseln, umbenennen
- Mitglieder einladen (Token-Link, Ablaufzeit), Rolle ändern, entfernen
- RBAC-Prüfung `can(actor, permission)` + Permission-Katalog als typisierte Konstante

### 1.6 Audit System
- Audit-Service mit Hash-Kette, Events für alle Aktionen aus 1.4/1.5
- Audit-Ansicht (Liste, Filter nach Akteur/Aktion/Zeitraum), nur für `audit:read`

### 1.7 UI-Grundgerüst & Designsystem
- Tokens (Onyx-Dark-Theme), Primitives in `packages/ui`
- Seiten: Login, Registrierung, Tenant-Onboarding, Dashboard-Shell (Navigation), Mitglieder, Rollen, Audit-Log
- Nicht implementierte Module (Agents, Workflows …) erscheinen in der Navigation als „Bald verfügbar“ und sind deaktiviert, nicht simuliert.

### 1.8 Tests & Abnahmekriterien
- [ ] Nutzer aus Tenant A kann Daten von Tenant B weder lesen noch schreiben (API- und DB-Ebene, RLS-Test)
- [ ] `viewer` kann keine Mitglieder einladen (403 + Audit `DENIED`)
- [ ] Jede schreibende Aktion erzeugt genau einen Audit-Eintrag, Hash-Kette ist verifizierbar
- [ ] App startet nicht ohne gültige ENV-Variablen
- [ ] CI grün, keine Secrets im Repo

**Geschätzter Umfang:** ca. 2–3 Wochen für eine Person (Richtwert).

---

## Phase 2 – Agent Engine (MVP) ✅

Umgesetzt: siehe AGENT_ARCHITECTURE.md §0. Getestet mit 10 Integrationstests (skriptgesteuertes Modell, echte Datenbank) und einem E2E-Test (UI → Queue → Worker → UI). Offen: Aufräumjob für abgestürzte Läufe, Live-Test mit echtem API-Schlüssel.

Ursprünglicher Plan:
LLM Gateway (Anthropic SDK, Retries, Token- und Kostenerfassung) · Tool Registry · Runtime im Worker · `AgentRun`/`AgentStep` · ein Agent „Unternehmensassistent“ mit READ-Tools auf ONYX-eigenen Daten · Run-Ansicht mit vollständigem Schrittprotokoll · Budgets & Kill Switch.

## Phase 3 – Approvals & Workflows
`ApprovalPolicy`/`ApprovalRequest` · Freigabe-Inbox · Pausieren/Fortsetzen von Runs · Workflow-Definitionen (JSON-DAG) · Trigger (manuell, cron, Webhook) · idempotente Schrittausführung.

## Phase 4 – Integrationen & n8n
Connector-Interface · verschlüsselte Credentials mit Rotation · OAuth-Flows · signierte n8n-Webhooks in beide Richtungen · erste echte Integrationen (z. B. E-Mail, CRM, nach Priorität des Nutzers).

## Phase 5 – Analytics & DSGVO
KPI-Dashboard (Runs, Kosten, Erfolgsquote, Durchlaufzeiten) · Datenexport und Löschung pro Nutzer/Tenant · Retention-Jobs · Unterauftragsverarbeiter-Übersicht.

## Phase 6 – Härtung & Go-live
Pen-Test · Lasttests · OpenTelemetry + Alerting · Backups/Restore-Übung · Billing · Rechtliche Prüfung (AVV, DSFA).

---

## Stand Phase 1 (2026-11-05)

Entscheidungen: Better Auth (nur Authentifizierung, eigene Tenancy), Hosting containerisiert in der EU, Login per E-Mail/Passwort, Repo-Umbenennung später.

**Umgesetzt und getestet**
- [x] Monorepo, strikte TS-Konfiguration, Zod-Env, Docker-Compose, GitHub-Actions-CI
- [x] Prisma-Schema P1, Migrationen, RLS, DB-Rollen, Seed der Systemrollen
- [x] Core: Fehlerhierarchie, pino mit Redaction, Request-ID, gehashte IP
- [x] Auth: Registrierung, E-Mail-Verifikation, Login, Passwort-Reset, `proxy.ts`
- [x] Tenant anlegen/umbenennen, Mitglieder einladen (Token-Link + E-Mail), Rolle ändern, entfernen/verlassen
- [x] Eigene Rollen anlegen/löschen mit Eskalationsschutz
- [x] Audit-Log-Ansicht mit Filter, Paginierung, Integritätsprüfung
- [x] Nicht implementierte Module in der Navigation als „Bald verfügbar“ deaktiviert
- [x] Worker-Skelett (BullMQ, Selbsttest, Graceful Shutdown)
- [x] Abnahmekriterien 1.8: 29 Tests (davon 12 Integrationstests gegen Postgres) + manueller End-to-End-Browserlauf

**Nachgezogen (zweiter Durchgang)**
- [x] API-Schlüssel: Verwaltung in der UI, REST-API `/api/v1/members` und `/api/v1/audit` mit Bearer-Auth, Rechte = Schlüssel ∩ aktueller Ersteller
- [x] Eigene Rollen in der UI bearbeiten
- [x] Playwright-E2E-Tests (Tenant-Flow, API-Schlüssel, 2FA) mit echtem SMTP-Empfänger, in der CI
- [x] Nonce-basierte CSP, Redis-Rate-Limiting (API + Login-Endpunkte), Zwei-Faktor-Anmeldung (TOTP + Backup-Codes)
- [x] CI: Dependency-Audit (high/critical) und Secret-Scanning (gitleaks)

**Offen**
- [ ] 2FA-Pflicht für Inhaber/Admins als Tenant-Einstellung erzwingen (aktuell Hinweisbanner)
- [ ] OpenAPI-Beschreibung der REST-API

## Offene Entscheidungen (ursprünglich, jetzt entschieden)

1. **Repo-Name:** `Nova-webseite` → in `onyx` umbenennen?
2. **Auth:** Auth.js v5 oder Better Auth (Empfehlung: kurze Evaluierung in 1.4, Tendenz Better Auth wegen nativer Org/MFA-Unterstützung).
3. **Hosting-Ziel:** Vercel + EU-Managed-DB oder vollständig containerisiert (z. B. Hetzner/Fly.io EU)? Beeinflusst den Worker-Betrieb.
4. **Login-Methoden in Phase 1:** nur E-Mail/Passwort oder zusätzlich Google/Microsoft SSO?
