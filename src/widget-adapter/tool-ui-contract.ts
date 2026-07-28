import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolUiBinding<TOutput = unknown> {
  resourceUri: string;
  outputTemplate?: string;
  widgetTitle: string;
  widgetDescription: string;
  widgetPrefersBorder?: boolean;
  widgetAccessible?: boolean;
  invokingText?: string;
  invokedText?: string;
  presenter: (result: TOutput) => CallToolResult;
}
