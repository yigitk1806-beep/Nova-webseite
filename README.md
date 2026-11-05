# ONYX

Mandantenfähiges KI-Unternehmensbetriebssystem. Architektur und Plan: [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) · [SECURITY.md](./SECURITY.md)

**Stand:** Phase 1 (Fundament) – Konten inkl. 2FA, Unternehmen, Mitglieder, Rollen, API-Schlüssel, REST-API, Audit-Log. KI-Agenten folgen in Phase 2.

## Struktur

```
apps/web        Next.js 16 – UI, Server Actions, Auth-Routen
apps/worker     BullMQ-Worker (Skelett)
packages/config Zod-validierte Umgebungsvariablen
packages/core   Fehler, Logger (pino, Redaction), Request-Kontext
packages/db     Prisma-Schema, Migrationen inkl. RLS, tenant-gebundene Transaktionen
packages/permissions  Permission-Katalog, Systemrollen, Eskalationsschutz
packages/audit  Append-only Audit-Log mit Hash-Kette
packages/tenancy  Services: Unternehmen, Mitglieder, Einladungen, Rollen
```

## Lokale Entwicklung

Voraussetzungen: Node 22, pnpm 10, Docker.

```bash
cp .env.example .env            # BETTER_AUTH_SECRET setzen: openssl rand -base64 48
docker compose up -d            # Postgres 16 + Redis 7 (legt Rolle onyx_app an)
pnpm install
pnpm db:migrate && pnpm db:seed
ln -s ../../.env apps/web/.env  # Next.js liest .env aus dem App-Verzeichnis
pnpm dev                        # http://localhost:3000
pnpm dev:worker                 # optional
```

Ohne `SMTP_URL` werden E-Mails (Bestätigung, Einladung) in Entwicklung ins Server-Log geschrieben. In Produktion startet die App ohne SMTP nicht.

## Prüfungen

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

End-to-End (nach `pnpm build`, mit laufender DB und Redis): `pnpm --filter @onyx/web test:e2e`. Ein lokaler SMTP-Empfänger wird automatisch gestartet.

## REST-API

Authentifizierung per API-Schlüssel (anlegen unter *API-Schlüssel* im Unternehmen):

```bash
curl -H "Authorization: Bearer onyx_sk_…" http://localhost:3000/api/v1/members   # member:read
curl -H "Authorization: Bearer onyx_sk_…" http://localhost:3000/api/v1/audit     # audit:read
```

`pnpm test` enthält Integrationstests gegen die echte Datenbank (Tenant-Isolation per RLS, Berechtigungen, Audit-Kette) und benötigt die laufende Postgres-Instanz.
