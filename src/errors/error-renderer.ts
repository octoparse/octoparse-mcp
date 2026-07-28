import messages from '../config/messages.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getMessageByKey(key: string): string | undefined {
  const resolved = key.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, messages);

  return typeof resolved === 'string' ? resolved : undefined;
}
