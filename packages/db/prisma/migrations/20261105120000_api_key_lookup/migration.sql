-- API-Schlüssel werden vor dem Tenant-Kontext über den SHA-256-Hash gefunden.
-- Die Funktion liefert nur die für die Authentifizierung nötigen Felder.
CREATE OR REPLACE FUNCTION onyx_api_key_lookup(p_hash text)
  RETURNS TABLE (id text, "tenantId" text, "createdById" text, permissions text[], "expiresAt" timestamp(3), "revokedAt" timestamp(3))
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT k.id, k."tenantId", k."createdById", k.permissions, k."expiresAt", k."revokedAt"
    FROM "ApiKey" k WHERE k.hash = p_hash
  $$;
REVOKE ALL ON FUNCTION onyx_api_key_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onyx_api_key_lookup(text) TO onyx_app;
