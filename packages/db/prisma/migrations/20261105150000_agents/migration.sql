-- CreateEnum
CREATE TYPE "RiskClass" AS ENUM ('READ', 'WRITE', 'EXTERNAL_COMMUNICATION', 'FINANCIAL', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('LLM_CALL', 'TOOL_CALL', 'POLICY_DENIED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'DENIED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "agentMonthlyBudgetCents" INTEGER,
ADD COLUMN     "agentsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activeVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL DEFAULT 'medium',
    "tools" TEXT[],
    "permissions" TEXT[],
    "maxSteps" INTEGER NOT NULL DEFAULT 12,
    "maxTokens" INTEGER NOT NULL DEFAULT 16000,
    "budgetCents" INTEGER NOT NULL DEFAULT 100,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentVersionId" TEXT NOT NULL,
    "triggeredByType" "ActorType" NOT NULL,
    "triggeredById" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "servedModel" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroCents" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "toolKey" TEXT,
    "input" JSONB,
    "output" JSONB,
    "riskClass" "RiskClass",
    "status" "StepStatus" NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicroCents" BIGINT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroCents" BIGINT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_tenantId_key_key" ON "AgentDefinition"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AgentVersion_tenantId_idx" ON "AgentVersion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_createdAt_idx" ON "AgentRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_status_idx" ON "AgentRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AgentStep_tenantId_idx" ON "AgentStep"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_index_key" ON "AgentStep"("runId", "index");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_createdAt_idx" ON "UsageRecord"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────── Rechte & RLS für Agent-Tabellen ─────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentDefinition", "AgentVersion", "AgentRun", "AgentStep" TO onyx_app;
-- Usage ist abrechnungsrelevant: nur anhängen und lesen
GRANT SELECT, INSERT ON "UsageRecord" TO onyx_app;
-- AgentVersion ist unveränderlich
REVOKE UPDATE ON "AgentVersion" FROM onyx_app;

ALTER TABLE "AgentDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agentdef_all ON "AgentDefinition" FOR ALL
  USING ("tenantId" = onyx_current_tenant()) WITH CHECK ("tenantId" = onyx_current_tenant());

ALTER TABLE "AgentVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agentversion_all ON "AgentVersion" FOR ALL
  USING ("tenantId" = onyx_current_tenant()) WITH CHECK ("tenantId" = onyx_current_tenant());

ALTER TABLE "AgentRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agentrun_all ON "AgentRun" FOR ALL
  USING ("tenantId" = onyx_current_tenant()) WITH CHECK ("tenantId" = onyx_current_tenant());

ALTER TABLE "AgentStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agentstep_all ON "AgentStep" FOR ALL
  USING ("tenantId" = onyx_current_tenant()) WITH CHECK ("tenantId" = onyx_current_tenant());

ALTER TABLE "UsageRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_select ON "UsageRecord" FOR SELECT USING ("tenantId" = onyx_current_tenant());
CREATE POLICY usage_insert ON "UsageRecord" FOR INSERT WITH CHECK ("tenantId" = onyx_current_tenant());
