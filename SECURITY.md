# ONYX – Sicherheit & Datenschutz

> Status: Entwurf v0.1 · Gilt verbindlich für alle Phasen

## 1. Meldung von Sicherheitslücken

Bitte Sicherheitslücken **nicht** als öffentliches Issue melden, sondern privat über GitHub Security Advisories („Report a vulnerability“) in diesem Repository.

## 2. Bedrohungsmodell (Kurzfassung)

| Bedrohung | Gegenmaßnahme |
|---|---|
| Datenzugriff über Tenant-Grenzen | `tenantId` in jeder Query (Prisma-Extension) + PostgreSQL RLS + automatisierte Isolationstests |
| Rechteausweitung | Deny-by-default-RBAC, serverseitige Prüfung in jedem Endpunkt (`withGuard`), nie nur im UI |
| Prompt Injection / Agent-Missbrauch | Tool-Allowlist pro Agent, Policy Gate, menschliche Freigabe nach Risikoklasse, Budgets (siehe AGENT_ARCHITECTURE.md) |
| Diebstahl von Zugangsdaten | Keine Secrets im Code. Integration-Credentials AES-256-GCM-verschlüsselt, Schlüsselrotation |
| Session-Übernahme | HttpOnly-, Secure-, SameSite=Lax-Cookies, Rotation bei Login, kurze Laufzeiten, MFA für Admins |
| Injection (SQL/XSS) | Prisma (parametrisiert), kein `$queryRawUnsafe`, React-Escaping, strikte CSP |
| CSRF | Server Actions mit Origin-Prüfung, SameSite-Cookies, Origin-Prüfung für mutierende Route Handler |
| Webhook-Spoofing | HMAC-Signatur, Zeitstempel und Replay-Schutz (Nonce in Redis) |
| Missbrauch / DoS | Rate Limiting pro IP, Nutzer, Tenant und API-Key. Queue-Limits, LLM-Budgets |
| Manipulation des Audit-Logs | Append-only (DB-Rechte), Hash-Kette pro Tenant |
| Supply Chain | Lockfile, Dependabot/Renovate, `pnpm audit` in der CI, gepinnte Versionen |

## 3. Verbindliche Regeln für Entwicklung

1. **Keine hardcodierten Schlüssel.** Alle Secrets kommen aus der Umgebung bzw. einem Secret Store und werden über `packages/config/env.ts` (Zod) validiert. `.env*` ist in `.gitignore`, nur `.env.example` ohne Werte wird eingecheckt. Secret-Scanning ist in der CI aktiv.
2. **Jeder Endpunkt** nutzt `withGuard(permission, schema, handler)`. Endpunkte ohne Guard schlagen im Lint/Test fehl.
3. **Eingaben** werden immer mit Zod validiert, Ausgaben sind explizit typisiert (keine Prisma-Objekte direkt an den Client).
4. **Fehler** an Clients sind generisch mit `requestId`. Details stehen nur im Server-Log.
5. **Logs** enthalten keine Passwörter, Tokens, API-Keys oder Klartext-PII (pino-Redaction).
6. **Externe Aktionen** (E-Mail, Zahlungen, Schreibzugriffe in Drittsystemen) laufen nur über den Integration Layer mit Permission-Prüfung und, je nach Risikoklasse, Freigabe.
7. **Passwörter** werden mit argon2id gehasht. API-Keys werden nur als SHA-256-Hash gespeichert und dem Nutzer einmalig angezeigt.

## 4. HTTP-Sicherheits-Header

`Content-Security-Policy` (nonce-basiert), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restriktiv, `frame-ancestors 'none'`.

## 5. DSGVO

| Anforderung | Umsetzung |
|---|---|
| Rechtsgrundlage & AVV | ONYX ist Auftragsverarbeiter der Tenants. AV-Vertrag (Art. 28) als Vorlage, Verzeichnis der Verarbeitungstätigkeiten |
| Datenminimierung | Nur notwendige Felder. IPs gehasht. Audit enthält Referenzen statt PII |
| Speicherbegrenzung | `retentionDays` pro Tenant, automatischer Löschjob für Runs, Steps und Audit |
| Betroffenenrechte | Export (Art. 15/20) und Löschung/Anonymisierung (Art. 17) per Admin-Funktion und API |
| Hosting | EU-Region für Datenbank, Redis und Anwendung |
| Drittlandübermittlung | Anthropic API und ggf. weitere Anbieter werden als Unterauftragsverarbeiter dokumentiert. Tenants werden informiert, Transfermechanismus (DPA/SCC) wird vor Go-live geprüft. Opt-out auf Tenant-Ebene für LLM-Verarbeitung ist möglich |
| Privacy by Design | Agenten erhalten nur die Daten, die ihre Tools explizit abrufen |
| Sicherheit der Verarbeitung (Art. 32) | Verschlüsselung in Transit (TLS 1.2+) und at Rest, Zugriffskontrolle, Audit, Backups mit Wiederherstellungstests |

> Diese Punkte sind technische Leitplanken und ersetzen keine Rechtsberatung. Vor dem Produktivbetrieb ist eine Prüfung durch Datenschutzbeauftragte/Juristen erforderlich (inkl. DSFA nach Art. 35 für KI-gestützte Verarbeitung).

## 6. Umsetzungsstand Phase 1

| Maßnahme | Status |
|---|---|
| RLS-Isolation, Nicht-Eigentümer-App-Rolle | ✅ umgesetzt, Integrationstests |
| RBAC mit Eskalationsschutz, letzter Inhaber geschützt | ✅ umgesetzt, Integrationstests |
| Audit append-only + Hash-Kette + DENIED-Protokollierung | ✅ umgesetzt, Integrationstests |
| argon2id, E-Mail-Verifikation Pflicht, Passwort-Reset widerruft Sessions | ✅ |
| Zod-Validierung aller Service-Eingaben, generische Fehlermeldungen mit Referenz-ID | ✅ |
| Sicherheits-Header (HSTS, nosniff, X-Frame-Options, Referrer/Permissions-Policy) | ✅ |
| Open-Redirect-Schutz (`next`-Parameter), Server-Action-Origin-Prüfung (Next.js) | ✅ |
| Telemetrie von Better Auth und Next.js deaktiviert | ✅ |
| Nonce-basierte CSP (`script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`) | ✅ (E2E prüft Header und Verstöße) |
| Rate Limiting über Redis: Login 10/min, 2FA 10/min, Backup-Codes 5/min, API 120/min pro Schlüssel; bei Redis-Ausfall fail-closed | ✅ |
| Zwei-Faktor (TOTP + Backup-Codes) für alle Nutzer, Hinweis für Inhaber/Admins | ✅ · Erzwingen per Tenant-Einstellung ⏳ offen |
| Secret-Scanning (gitleaks) und Dependency-Audit (high/critical) in der CI | ✅ |
| API-Schlüssel: nur SHA-256-Hash, Rechte = Schlüssel ∩ aktueller Ersteller, keine Schlüsselverwaltung/Löschrechte | ✅ Integrationstests |

**KI-Agenten (Phase 2):** Werkzeug-Ergebnisse werden als Daten markiert; ein fester Sicherheitsrahmen steht vor jedem System-Prompt. Die eigentliche Abwehr gegen Prompt Injection ist das Policy Gate: nur freigegebene, lesende Werkzeuge, Rechte = Agent ∩ auslösende Person, jede Ablehnung als `agent.tool.denied` im Audit. Agent-Versionen sind auf DB-Ebene unveränderlich (kein `UPDATE`-Recht), `UsageRecord` ist append-only. Datenschutz: An Anthropic gehen nur die Aufgabe und die Werkzeug-Ergebnisse (z. B. Namen und Rollen, keine E-Mail-Adressen). Anthropic ist als Unterauftragsverarbeiter zu dokumentieren; per Kill Switch lässt sich die KI-Verarbeitung pro Unternehmen abschalten.

Bekannte Einschränkung: `style-src` erlaubt `'unsafe-inline'` (Animationen setzen Inline-Styles). Skripte bleiben strikt nonce-gebunden.

Bekannte Datenverarbeitung: Better Auth speichert IP-Adresse und User-Agent in `Session` (Sicherheitszweck, Löschung mit Ablauf der Session). In `AuditLog` wird nur ein gesalzener Hash der IP gespeichert.

## 7. Sicherheits-Checkliste pro Phase

- [ ] Tenant-Isolationstests für jede neue Tabelle und jeden neuen Endpunkt
- [ ] Permission-Matrix aktualisiert
- [ ] Audit-Events für alle neuen schreibenden Aktionen
- [ ] Keine neuen Secrets im Code (CI-Scan grün)
- [ ] Neue Tools mit Risikoklasse und Approval-Verhalten dokumentiert
