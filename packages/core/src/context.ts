import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';

export type ActorKind = 'USER' | 'AGENT' | 'SYSTEM' | 'API_KEY';

export interface ActorRef {
  type: ActorKind;
  id: string;
}

export interface RequestMeta {
  requestId: string;
  /** SHA-256 der IP mit Secret-Salt – nie die Klartext-IP speichern. */
  ipHash: string | null;
}

const storage = new AsyncLocalStorage<RequestMeta>();

export function runWithRequestMeta<T>(meta: RequestMeta, fn: () => T): T {
  return storage.run(meta, fn);
}

export function currentRequestMeta(): RequestMeta | undefined {
  return storage.getStore();
}

export function newRequestId(): string {
  return randomUUID();
}

export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
