-- ONYX: Mandantenisolation (Row-Level-Security), Rechte der Anwendungsrolle, Audit-Schutz.
--
-- Modell:
--   * Migrationen laufen als Tabelleneigentümer (Wartungsrolle). RLS wird bewusst NICHT
--     erzwungen (kein FORCE), damit Wartung/Seed möglich bleibt.
--   * Die Anwendung verbindet sich als "onyx_app" (kein Eigentümer, NOBYPASSRLS) → RLS gilt.
--   * Pro Transaktion setzt die Anwendung app.tenant_id und app.user_id (SET LOCAL).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'onyx_app') THEN
    RAISE EXCEPTION 'Rolle onyx_app fehlt. Vor der Migration anlegen (siehe infra/postgres/init.sql).';
  END IF;
END $$;

-- ───────────── Kontextfunktionen ─────────────
CREATE OR REPLACE FUNCTION onyx_current_tenant() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

CREATE OR REPLACE FUNCTION onyx_current_user() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

-- ───────────── Rechte der Anwendungsrolle ─────────────
GRANT USAGE ON SCHEMA public TO onyx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Tenant", "Membership", "Invitation", "Role", "ApiKey",
  "User", "Session", "Account", "Verification"
  TO onyx_app;
-- Audit: nur lesen und anhängen
GRANT SELECT, INSERT ON "AuditLog" TO onyx_app;
GRANT USAGE, SELECT ON SEQUENCE "AuditLog_id_seq" TO onyx_app;
GRANT EXECUTE ON FUNCTION onyx_current_tenant(), onyx_current_user() TO onyx_app;

-- ───────────── RLS: Tenant ─────────────
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON "Tenant" FOR SELECT USING (
  id = onyx_current_tenant()
  OR EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."tenantId" = "Tenant".id
      AND m."userId" = onyx_current_user()
      AND m.status = 'ACTIVE'
  )
);
CREATE POLICY tenant_insert ON "Tenant" FOR INSERT WITH CHECK (id = onyx_current_tenant());
CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING (id = onyx_current_tenant()) WITH CHECK (id = onyx_current_tenant());
CREATE POLICY tenant_delete ON "Tenant" FOR DELETE USING (id = onyx_current_tenant());

-- ───────────── RLS: Membership ─────────────
-- Lesen: eigener Tenant ODER eigene Mitgliedschaften (für die Tenant-Auswahl).
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_select ON "Membership" FOR SELECT USING (
  "tenantId" = onyx_current_tenant() OR "userId" = onyx_current_user()
);
CREATE POLICY membership_write ON "Membership" FOR ALL
  USING ("tenantId" = onyx_current_tenant())
  WITH CHECK ("tenantId" = onyx_current_tenant());

-- ───────────── RLS: Role ─────────────
-- Systemrollen (tenantId NULL) sind lesbar, aber durch die App nicht änderbar.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_select ON "Role" FOR SELECT USING (
  "tenantId" IS NULL OR "tenantId" = onyx_current_tenant()
);
CREATE POLICY role_insert ON "Role" FOR INSERT WITH CHECK ("tenantId" = onyx_current_tenant());
CREATE POLICY role_update ON "Role" FOR UPDATE
  USING ("tenantId" = onyx_current_tenant()) WITH CHECK ("tenantId" = onyx_current_tenant());
CREATE POLICY role_delete ON "Role" FOR DELETE USING ("tenantId" = onyx_current_tenant());

-- ───────────── RLS: Invitation, ApiKey ─────────────
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_all ON "Invitation" FOR ALL
  USING ("tenantId" = onyx_current_tenant())
  WITH CHECK ("tenantId" = onyx_current_tenant());

ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY apikey_all ON "ApiKey" FOR ALL
  USING ("tenantId" = onyx_current_tenant())
  WITH CHECK ("tenantId" = onyx_current_tenant());

-- ───────────── RLS: AuditLog ─────────────
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON "AuditLog" FOR SELECT USING ("tenantId" = onyx_current_tenant());
CREATE POLICY audit_insert ON "AuditLog" FOR INSERT WITH CHECK ("tenantId" = onyx_current_tenant());

-- Unveränderlichkeit auch für Eigentümer: UPDATE nie, DELETE nur im expliziten Retention-Modus.
CREATE OR REPLACE FUNCTION onyx_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('onyx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog ist unveränderlich (%)', TG_OP;
END $$;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION onyx_audit_immutable();

-- ───────────── Einladungs-Lookup ─────────────
-- Einladungen werden per geheimem Token angenommen, bevor ein Tenant-Kontext existiert.
-- Die Funktion gibt ausschließlich id und tenantId zum (nicht erratbaren) Token-Hash zurück.
CREATE OR REPLACE FUNCTION onyx_invitation_lookup(p_token_hash text)
  RETURNS TABLE (id text, "tenantId" text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT i.id, i."tenantId" FROM "Invitation" i WHERE i."tokenHash" = p_token_hash
  $$;
REVOKE ALL ON FUNCTION onyx_invitation_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onyx_invitation_lookup(text) TO onyx_app;

-- Prisma-Metadaten sind für die App tabu.
REVOKE ALL ON "_prisma_migrations" FROM onyx_app;
