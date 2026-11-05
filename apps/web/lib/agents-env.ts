import 'server-only';
import { isLlmConfigured } from '@onyx/agents';
import { serverEnv } from '@onyx/config';

/** Grund, warum Läufe aktuell nicht starten können (oder null). */
export function runBlocker(agentsEnabled: boolean): string | null {
  if (!agentsEnabled)
    return 'Agenten sind für dieses Unternehmen deaktiviert (Kill Switch in den Einstellungen).';
  if (!isLlmConfigured())
    return 'Kein Anthropic-API-Schlüssel konfiguriert (ANTHROPIC_API_KEY). Läufe sind erst danach möglich.';
  if (!serverEnv().REDIS_URL) return 'Die Job-Warteschlange (REDIS_URL) ist nicht konfiguriert.';
  return null;
}
