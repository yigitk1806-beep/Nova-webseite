/** Erlaubt nur relative, interne Pfade (verhindert Open Redirects). */
export function safeNext(value: string | null | undefined, fallback = '/onboarding'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  return value;
}
