import { AppConfig } from '../config/app-config.js';
import { RequestContextManager } from '../utils/request-context.js';

export type UiWidgetMode = 'openai-widget' | 'inert-widget-resource';

export interface UiClientPolicy {
  clientName?: string;
  clientVersion?: string;
  widgetMode: UiWidgetMode;
  allowToolRegistrationMeta: boolean;
  allowToolResultPresenter: boolean;
  widgetResource: {
    mimeType: 'text/html;profile=mcp-app' | 'text/plain';
    includeHtml: boolean;
    includeOpenAiMeta: boolean;
  };
}

export interface UiClientPolicyInput {
  clientName?: string;
  clientVersion?: string;
}

const OPENAI_WIDGET_MIME_TYPE = 'text/html;profile=mcp-app' as const;
const INERT_WIDGET_MIME_TYPE = 'text/plain' as const;

function normalizeClientName(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
  return normalized ? normalized : undefined;
}

function getNormalizedWidgetClientAllowList(): string[] {
  return AppConfig.getUiConfig().widgetClientAllowList
    .map((name) => normalizeClientName(name))
    .filter((name): name is string => name !== undefined);
}

export function isUiMetaAllowedForCurrentClient(): boolean {
  const context = RequestContextManager.getContext();
  if (context?.uiPolicy) {
    return context.uiPolicy.allowToolRegistrationMeta || context.uiPolicy.allowToolResultPresenter;
  }

  return isUiMetaAllowedForClient(context?.clientName);
}

export function isUiMetaAllowedForClient(rawClientName: string | undefined): boolean {
  const clientName = normalizeClientName(rawClientName);
  if (!clientName) {
    return false;
  }

  return getNormalizedWidgetClientAllowList().some((name) => name === clientName);
}

export function resolveUiClientPolicy(input: UiClientPolicyInput = {}): UiClientPolicy {
  const isAllowed = isUiMetaAllowedForClient(input.clientName);
  if (isAllowed) {
    return {
      clientName: input.clientName,
      clientVersion: input.clientVersion,
      widgetMode: 'openai-widget',
      allowToolRegistrationMeta: true,
      allowToolResultPresenter: true,
      widgetResource: {
        mimeType: OPENAI_WIDGET_MIME_TYPE,
        includeHtml: true,
        includeOpenAiMeta: true
      }
    };
  }

  return {
    clientName: input.clientName,
    clientVersion: input.clientVersion,
    widgetMode: 'inert-widget-resource',
    allowToolRegistrationMeta: false,
    allowToolResultPresenter: false,
    widgetResource: {
      mimeType: INERT_WIDGET_MIME_TYPE,
      includeHtml: false,
      includeOpenAiMeta: false
    }
  };
}
