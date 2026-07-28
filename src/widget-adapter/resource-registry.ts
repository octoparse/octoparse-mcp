import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UiClientPolicy } from './ui-client-policy.js';
import { resolveUiClientPolicy } from './ui-client-policy.js';
import {
  SEARCH_TASKS_WIDGET_URI,
  SEARCH_TEMPLATES_WIDGET_URI,
  renderWidgetResource,
  widgetResourceDefinitions
} from './widget-resource-renderer.js';

export { SEARCH_TASKS_WIDGET_URI, SEARCH_TEMPLATES_WIDGET_URI };

export function registerWidgetResources(
  server: McpServer,
  options: {
    uiPolicy?: UiClientPolicy;
    uiMetaEnabled?: boolean;
  } = {}
): void {
  const uiPolicy = options.uiPolicy ?? resolveUiClientPolicy();
  const effectivePolicy = options.uiPolicy
    ?? (options.uiMetaEnabled === true
      ? resolveUiClientPolicy({ clientName: 'openai-mcp' })
      : uiPolicy);

  for (const definition of widgetResourceDefinitions) {
    server.registerResource(
      definition.name,
      definition.uri,
      {
        title: definition.title,
        description: definition.description,
        mimeType: effectivePolicy.widgetResource.mimeType
      },
      async () => {
        const rendered = renderWidgetResource(definition, effectivePolicy);
        return {
          contents: [
            {
              uri: rendered.uri,
              mimeType: rendered.mimeType,
              text: rendered.text,
              ...(rendered._meta ? { _meta: rendered._meta } : {})
            }
          ]
        };
      }
    );
  }
}
