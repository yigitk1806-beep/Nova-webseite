/**
 * Fehlerhierarchie. `publicMessage` darf an Clients gehen, `message` nur ins Log.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'APPROVAL_REQUIRED'
  | 'EXTERNAL_SERVICE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  APPROVAL_REQUIRED: 202,
  EXTERNAL_SERVICE: 502,
  INTERNAL: 500,
};

export class OnyxError extends Error {
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, publicMessage: string, options?: { cause?: unknown; internal?: string; details?: Record<string, unknown> }) {
    super(options?.internal ?? publicMessage, { cause: options?.cause });
    this.name = new.target.name;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = options?.details;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export class UnauthenticatedError extends OnyxError {
  constructor(msg = 'Bitte melde dich an.') {
    super('UNAUTHENTICATED', msg);
  }
}
export class ForbiddenError extends OnyxError {
  constructor(msg = 'Dafür fehlt dir die Berechtigung.', internal?: string) {
    super('FORBIDDEN', msg, internal ? { internal } : undefined);
  }
}
export class NotFoundError extends OnyxError {
  constructor(msg = 'Nicht gefunden.') {
    super('NOT_FOUND', msg);
  }
}
export class ValidationError extends OnyxError {
  constructor(msg = 'Eingabe ungültig.', details?: Record<string, unknown>) {
    super('VALIDATION', msg, details ? { details } : undefined);
  }
}
export class ConflictError extends OnyxError {
  constructor(msg: string) {
    super('CONFLICT', msg);
  }
}

export function isOnyxError(e: unknown): e is OnyxError {
  return e instanceof OnyxError;
}
