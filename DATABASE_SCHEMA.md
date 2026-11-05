# ONYX – Datenbankschema

> Status: Entwurf v0.1 · PostgreSQL 16+ · Prisma ORM
> Das Schema wird schrittweise je Phase migriert. Phase 1 umfasst nur die mit **[P1]** markierten Modelle.

## 1. Konventionen

- IDs: `cuid2` als `String @id`. Sie sind nicht erratbar und verraten keine Reihenfolge.
- Jede fachliche Tabelle hat `tenantId` (FK, indiziert) sowie `createdAt` und `updatedAt`.
- Soft Delete (`deletedAt`) nur dort, wo fachlich nötig. DSGVO-Löschungen sind **harte** Löschungen bzw. Anonymisierung.
- Geldbeträge als `Decimal`/Integer in kleinster Einheit, niemals `Float`.
- Secrets werden nie im Klartext gespeichert: `encryptedSecret Bytes` + `keyVersion Int`.
- Composite-Indizes beginnen immer mit `tenantId`.
- RLS-Policy auf allen Tabellen mit `tenantId`: `USING (tenant_id = current_setting('app.tenant_id'))`.

## 2. Entitätenübersicht

```
Tenant ─┬─< Membership >── User ──< Session / Account (Auth)
        ├─< Role ──< RolePermission
        ├─< ApiKey
        ├─< AgentDefinition ──< AgentVersion
        │        └─< AgentRun ──< AgentStep
        │                 └─< ApprovalRequest
        ├─< WorkflowDefinition ──< WorkflowVersion
        │        └─< WorkflowRun ──< WorkflowStepRun
        ├─< Integration ──< IntegrationCredential
        ├─< AuditLog
        ├─< AnalyticsEvent
        └─< UsageRecord (Token/Kosten)
```

## 3. Prisma-Schema (Entwurf)

```prisma
// ───────────── Tenancy & Identity ─────────────  [P1]
model Tenant {
  id            String   @id @default(cuid(2))
  slug          String   @unique
  name          String
  plan          Plan     @default(FREE)
  dataRegion    String   @default("eu-central")
  settings      Json     @default("{}")
  retentionDays Int      @default(365)          // Aufbewahrung Audit/Runs
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  memberships   Membership[]
  roles         Role[]
}

model User {
  id            String    @id @default(cuid(2))
  email         String    @unique
  name          String?
  emailVerified DateTime?
  passwordHash  String?                          // argon2id, falls Credentials-Login
  mfaSecretEnc  Bytes?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  memberships   Membership[]
  sessions      Session[]
  accounts      Account[]
}

model Membership {
  id        String   @id @default(cuid(2))
  tenantId  String
  userId    String
  roleId    String
  status    MembershipStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      Role     @relation(fields: [roleId], references: [id])
  @@unique([tenantId, userId])
}

// Session/Account/VerificationToken gemäß gewählter Auth-Bibliothek  [P1]

// ───────────── Permissions ─────────────  [P1]
model Role {
  id          String  @id @default(cuid(2))
  tenantId    String?                           // null = Systemrolle
  key         String                            // owner | admin | member | viewer | custom
  name        String
  permissions String[]                          // z. B. ["agent:run", "workflow:edit"]
  isSystem    Boolean @default(false)
  tenant      Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  memberships Membership[]
  @@unique([tenantId, key])
}

model ApprovalPolicy {
  id            String    @id @default(cuid(2))
  tenantId      String
  riskClass     RiskClass
  requiredRole  String                         // Role.key
  minApprovers  Int       @default(1)
  enabled       Boolean   @default(true)
  @@unique([tenantId, riskClass])
}

model ApiKey {
  id          String    @id @default(cuid(2))
  tenantId    String
  name        String
  prefix      String                           // sichtbar, z. B. "onyx_live_ab12"
  hash        String    @unique                // SHA-256 des Schlüssels
  permissions String[]
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdById String
  createdAt   DateTime  @default(now())
  @@index([tenantId])
}

// ───────────── Audit ─────────────  [P1]
model AuditLog {
  id         BigInt    @id @default(autoincrement())
  tenantId   String
  actorType  ActorType                         // USER | AGENT | SYSTEM | API_KEY
  actorId    String
  action     String                            // z. B. "agent.run.started"
  resource   String                            // z. B. "AgentRun"
  resourceId String?
  outcome    Outcome                           // SUCCESS | DENIED | FAILED
  metadata   Json      @default("{}")          // PII-minimiert
  requestId  String?
  agentRunId String?
  ipHash     String?                           // gehasht, nicht Klartext-IP
  prevHash   String?
  hash       String
  createdAt  DateTime  @default(now())
  @@index([tenantId, createdAt])
  @@index([tenantId, resource, resourceId])
}

// ───────────── Agents ─────────────  [P2]
model AgentDefinition {
  id          String   @id @default(cuid(2))
  tenantId    String
  key         String
  name        String
  description String?
  activeVersionId String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  versions    AgentVersion[]
  @@unique([tenantId, key])
}

model AgentVersion {
  id            String   @id @default(cuid(2))
  agentId       String
  version       Int
  systemPrompt  String
  model         String                          // aus erlaubter Modellliste (Config)
  tools         String[]                        // Tool-Keys
  permissions   String[]                        // Agent-Identität
  maxSteps      Int      @default(20)
  maxTokens     Int      @default(4096)
  budgetCents   Int?                            // Kostenlimit pro Run
  createdById   String
  createdAt     DateTime @default(now())
  agent         AgentDefinition @relation(fields: [agentId], references: [id], onDelete: Cascade)
  @@unique([agentId, version])
}

model AgentRun {
  id             String     @id @default(cuid(2))
  tenantId       String
  agentVersionId String
  triggeredByType ActorType
  triggeredById  String
  workflowRunId  String?
  status         RunStatus                       // QUEUED | RUNNING | WAITING_APPROVAL | SUCCEEDED | FAILED | CANCELLED
  input          Json
  output         Json?
  error          String?
  inputTokens    Int        @default(0)
  outputTokens   Int        @default(0)
  costMicroCents BigInt     @default(0)
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime   @default(now())
  steps          AgentStep[]
  @@index([tenantId, createdAt])
  @@index([tenantId, status])
}

model AgentStep {
  id         String   @id @default(cuid(2))
  runId      String
  index      Int
  type       StepType                           // LLM_CALL | TOOL_CALL | TOOL_RESULT | APPROVAL | MESSAGE
  toolKey    String?
  input      Json?
  output     Json?
  riskClass  RiskClass?
  status     StepStatus
  durationMs Int?
  createdAt  DateTime @default(now())
  run        AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@unique([runId, index])
}

model ApprovalRequest {
  id           String         @id @default(cuid(2))
  tenantId     String
  agentRunId   String?
  workflowRunId String?
  stepRef      String
  riskClass    RiskClass
  summary      String                           // menschenlesbar: Was soll passieren?
  payload      Json                             // exakte Aktion (unveränderlich)
  payloadHash  String                           // Schutz gegen nachträgliche Änderung
  status       ApprovalStatus @default(PENDING) // PENDING | APPROVED | REJECTED | EXPIRED
  decidedById  String?
  decidedAt    DateTime?
  reason       String?
  expiresAt    DateTime
  createdAt    DateTime       @default(now())
  @@index([tenantId, status])
}

// ───────────── Workflows ─────────────  [P3]
model WorkflowDefinition { id String @id @default(cuid(2)) tenantId String key String name String activeVersionId String? @@unique([tenantId, key]) }
model WorkflowVersion    { id String @id @default(cuid(2)) workflowId String version Int graph Json trigger Json createdById String createdAt DateTime @default(now()) @@unique([workflowId, version]) }
model WorkflowRun        { id String @id @default(cuid(2)) tenantId String workflowVersionId String status RunStatus context Json startedAt DateTime? finishedAt DateTime? @@index([tenantId, status]) }
model WorkflowStepRun    { id String @id @default(cuid(2)) runId String stepKey String attempt Int @default(1) status StepStatus input Json? output Json? error String? idempotencyKey String @unique }

// ───────────── Integrations ─────────────  [P4]
model Integration {
  id         String   @id @default(cuid(2))
  tenantId   String
  provider   String                            // "n8n", "google", "hubspot" …
  status     IntegrationStatus
  config     Json     @default("{}")           // nicht-geheime Konfiguration
  createdAt  DateTime @default(now())
  @@unique([tenantId, provider])
}
model IntegrationCredential {
  id              String   @id @default(cuid(2))
  integrationId   String   @unique
  encryptedSecret Bytes
  keyVersion      Int
  expiresAt       DateTime?
  rotatedAt       DateTime?
}

// ───────────── Analytics & Usage ─────────────  [P2/P5]
model UsageRecord    { id String @id @default(cuid(2)) tenantId String kind String quantity BigInt costMicroCents BigInt refId String? createdAt DateTime @default(now()) @@index([tenantId, createdAt]) }
model AnalyticsEvent { id BigInt @id @default(autoincrement()) tenantId String name String props Json occurredAt DateTime @@index([tenantId, name, occurredAt]) }

// ───────────── Enums ─────────────
enum Plan             { FREE PRO ENTERPRISE }
enum MembershipStatus { INVITED ACTIVE SUSPENDED }
enum ActorType        { USER AGENT SYSTEM API_KEY }
enum Outcome          { SUCCESS DENIED FAILED }
enum RiskClass        { READ WRITE EXTERNAL_COMMUNICATION FINANCIAL DESTRUCTIVE }
enum RunStatus        { QUEUED RUNNING WAITING_APPROVAL SUCCEEDED FAILED CANCELLED }
enum StepType         { LLM_CALL TOOL_CALL TOOL_RESULT APPROVAL MESSAGE }
enum StepStatus       { PENDING RUNNING SUCCEEDED FAILED SKIPPED }
enum ApprovalStatus   { PENDING APPROVED REJECTED EXPIRED }
enum IntegrationStatus { CONNECTED ERROR DISCONNECTED }
```

> Hinweis: Relationen der P2–P5-Modelle sind hier zur Übersicht verkürzt und werden in der jeweiligen Phase vollständig ausmodelliert.

## 4. Row-Level-Security (Beispiel)

```sql
ALTER TABLE "AgentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgentRun"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```
Die App setzt `SET LOCAL app.tenant_id = $1` in jeder Transaktion (Prisma-Extension). Die App-DB-Rolle ist **kein** Superuser und **nicht** Tabelleneigentümer. Migrationen laufen mit einer separaten Rolle.

`AuditLog`: Die App-Rolle erhält nur `INSERT` und `SELECT`, kein `UPDATE` und kein `DELETE`. Löschungen nach Ablauf der Aufbewahrungsfrist erledigt ein dedizierter Wartungsjob mit eigener Rolle.

## 5. DSGVO-Aspekte im Datenmodell

- Personenbezogene Daten sind im Wesentlichen auf `User` und Integrationsdaten konzentriert, damit Auskunft (Art. 15) und Löschung (Art. 17) gezielt möglich sind.
- Audit-Metadaten enthalten Referenz-IDs statt Klartext-PII, IPs werden gehasht.
- LLM-Inputs und -Outputs in `AgentStep` können PII enthalten. Sie unterliegen der tenant-spezifischen `retentionDays` und werden danach gelöscht oder anonymisiert.
- Export-Endpunkt pro Nutzer und Tenant (JSON) in Phase 5.
