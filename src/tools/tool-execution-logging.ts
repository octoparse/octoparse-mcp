import type { ToolDefinition } from './tool-definition.js';

function hasLogValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return true;
}

function compactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => compactLogValue(item))
      .filter(hasLogValue);
    return items.length > 0 ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, compactLogValue(nested)] as const)
      .filter(([, nested]) => hasLogValue(nested));
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return hasLogValue(value) ? value : undefined;
}

function buildToolInputLog(input: unknown): Record<string, unknown> | undefined {
  const compacted = compactLogValue(input);
  if (!compacted || typeof compacted !== 'object' || Array.isArray(compacted)) {
    return undefined;
  }

  return compacted as Record<string, unknown>;
}

function pickLogFields(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> | undefined {
  const output = Object.fromEntries(
    keys
      .map((key) => [key, compactLogValue(source[key])] as const)
      .filter(([, value]) => hasLogValue(value))
  );

  return Object.keys(output).length > 0 ? output : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function getTemplateId(value: unknown): string | undefined {
  const record = getRecord(value);
  const templateRef = getRecord(record?.templateRef);
  const id = record?.templateId ?? templateRef?.templateId;
  if (id === undefined || id === null || id === '') {
    return undefined;
  }

  return String(id);
}

function getProjectionRecord(result: unknown): Record<string, unknown> | undefined {
  const record = getRecord(result);
  if (!record) {
    return undefined;
  }

  const structuredContent = getRecord(record.structuredContent);
  return structuredContent ?? record;
}

function projectToolOutput(toolName: string, result: unknown): Record<string, unknown> | undefined {
  const record = getProjectionRecord(result);
  if (!record) {
    return undefined;
  }

  switch (toolName) {
    case 'search_templates': {
      const templates = Array.isArray(record.templates) ? record.templates : [];
      const templateIds = templates
        .map(getTemplateId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(',');
      return templateIds ? { templateIds } : undefined;
    }
    case 'execute_task':
      return pickLogFields(record, ['taskId', 'lotNo', 'message']);
    case 'export_data':
      return pickLogFields(record, [
        'taskId',
        'status',
        'lot',
        'dataTotal',
        'latestExportFileStatusLabel',
        'message'
      ]);
    case 'start_or_stop_task':
      return pickLogFields(record, [
        'taskId',
        'previousStatus',
        'status',
        'lot',
        'message'
      ]);
    default:
      return undefined;
  }
}

export function buildToolExecutionLogMeta(
  tool: ToolDefinition,
  input: unknown,
  result?: unknown,
  extraMeta: Record<string, unknown> = {}
): Record<string, unknown> {
  const toolInput = buildToolInputLog(input);
  const toolOutput = result === undefined ? undefined : projectToolOutput(tool.name, result);

  return {
    ...extraMeta,
    ...(toolInput ? { toolInput } : {}),
    ...(toolOutput ? { toolOutput } : {})
  };
}
