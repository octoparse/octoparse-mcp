import { AppConfig } from '../config/app-config.js';
import type { ToolUiBinding } from './tool-ui-contract.js';

const DEFAULT_WIDGET_RESOURCE_DOMAINS = [
  'https://image.bazhuayu.com',
  'https://op.image.skieer.com'
];

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function buildOpenAiToolRegistrationMeta(input: {
  title: string;
  resourceUri: string;
  outputTemplate?: string;
  widgetAccessible?: boolean;
  invokingText?: string;
  invokedText?: string;
}): Record<string, unknown> {
  const outputTemplate = input.outputTemplate ?? input.resourceUri;
  return {
    ui: {
      resourceUri: outputTemplate
    },
    'openai/outputTemplate': outputTemplate,
    'openai/widgetAccessible': input.widgetAccessible ?? false,
    'openai/toolInvocation/invoking': input.invokingText ?? `${input.title} is loading...`,
    'openai/toolInvocation/invoked': input.invokedText ?? `${input.title} is ready.`
  };
}

export function buildOpenAiWidgetResultMeta(input: {
  resourceUri: string;
  outputTemplate?: string;
  widgetAccessible?: ToolUiBinding['widgetAccessible'];
  widgetData?: Record<string, unknown>;
}): Record<string, unknown> {
  const resourceUri = input.outputTemplate ?? input.resourceUri;
  return {
    ui: {
      resourceUri
    },
    'openai/outputTemplate': resourceUri,
    'openai/resultCanProduceWidget': true,
    'openai/widgetAccessible': input.widgetAccessible ?? false,
    ...(input.widgetData ?? {})
  };
}

export function buildOpenAiWidgetResourceMeta(description: string): Record<string, unknown> {
  const publicBaseUrl = trimTrailingSlash(AppConfig.getServerConfig().publicBaseUrl);
  const resourceDomains = Array.from(new Set([publicBaseUrl, ...DEFAULT_WIDGET_RESOURCE_DOMAINS]));
  const csp = {
    connect_domains: [publicBaseUrl],
    resource_domains: resourceDomains
  };

  return {
    'openai/widgetDescription': description,
    ui: {
      prefersBorder: true,
      domain: publicBaseUrl,
      csp
    },
    'openai/widgetPrefersBorder': true,
    'openai/widgetDomain': publicBaseUrl,
    'openai/widgetCSP': csp
  };
}
