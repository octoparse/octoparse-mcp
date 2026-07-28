import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolUiBinding } from './tool-ui-contract.js';
import { buildOpenAiWidgetResultMeta } from './openai-widget-meta.js';

function normalizeStructuredContent(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    value
  };
}

export function createOpenAiWidgetToolResult(input: {
  binding: Pick<ToolUiBinding, 'resourceUri' | 'outputTemplate' | 'widgetAccessible'>;
  text: string;
  structuredContent?: unknown;
  widgetData?: Record<string, unknown>;
  isError?: boolean;
}): CallToolResult {
  const resourceUri = input.binding.outputTemplate ?? input.binding.resourceUri;

  return {
    content: [
      {
        type: 'text',
        text: input.text
      }
    ],
    ...(normalizeStructuredContent(input.structuredContent) !== undefined
      ? { structuredContent: normalizeStructuredContent(input.structuredContent) }
      : {}),
    _meta: buildOpenAiWidgetResultMeta({
      resourceUri,
      widgetAccessible: input.binding.widgetAccessible,
      widgetData: input.widgetData
    }),
    ...(input.isError ? { isError: true } : {})
  };
}
