import type { ToolDefinition } from '../tools/tool-definition.js';

export interface ToolSelectionInput {
  includeTools?: unknown;
  excludeTools?: unknown;
}

export interface ToolSelectionState {
  includeTools: string[];
  excludeTools: string[];
  resolvedToolNames: string[];
}

export interface ToolSelectionResolution extends ToolSelectionState {
  unknownToolNames: string[];
}

function splitToolQueryValue(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitToolQueryValue(entry));
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

export function normalizeToolQueryValue(value: unknown): string[] {
  return dedupePreservingOrder(splitToolQueryValue(value));
}

export function resolveToolSelection(
  input: ToolSelectionInput,
  availableToolNames: string[]
): ToolSelectionResolution {
  const includeTools = normalizeToolQueryValue(input.includeTools);
  const excludeTools = normalizeToolQueryValue(input.excludeTools);
  const availableSet = new Set(availableToolNames);
  const unknownToolNames = dedupePreservingOrder(
    [...includeTools, ...excludeTools].filter((toolName) => !availableSet.has(toolName))
  );

  const includeBase =
    includeTools.length > 0
      ? includeTools.filter((toolName) => availableSet.has(toolName))
      : [...availableToolNames];
  const excludeSet = new Set(excludeTools.filter((toolName) => availableSet.has(toolName)));
  const resolvedToolNames = includeBase.filter((toolName) => !excludeSet.has(toolName));

  return {
    includeTools,
    excludeTools,
    resolvedToolNames,
    unknownToolNames
  };
}

export function applyResolvedToolSelection<TTool extends ToolDefinition>(
  tools: TTool[],
  resolvedToolNames: string[]
): TTool[] {
  const allowedNames = new Set(resolvedToolNames);
  return tools.filter((tool) => allowedNames.has(tool.name));
}

export function createDefaultToolSelection(availableToolNames: string[]): ToolSelectionState {
  return {
    includeTools: [],
    excludeTools: [],
    resolvedToolNames: [...availableToolNames]
  };
}
