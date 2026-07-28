import { AppConfig } from '../config/app-config.js';
import type { UiClientPolicy } from './ui-client-policy.js';
import { buildOpenAiWidgetResourceMeta } from './openai-widget-meta.js';

export const SEARCH_TEMPLATES_WIDGET_URI = 'ui://widget/search-templates.html';
export const SEARCH_TASKS_WIDGET_URI = 'ui://widget/search-tasks.html';

export interface WidgetResourceDefinition {
  name: string;
  uri: string;
  title: string;
  description: string;
  htmlTitle: string;
  entrypoint: 'search-templates' | 'search-tasks';
  widgetDescription: string;
}

export interface RenderedWidgetResource {
  uri: string;
  mimeType: string;
  text: string;
  _meta?: Record<string, unknown>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildWidgetHtml(input: {
  title: string;
  entrypoint: 'search-templates' | 'search-tasks';
}): string {
  const publicBaseUrl = trimTrailingSlash(AppConfig.getServerConfig().publicBaseUrl);
  const stylesheetUrl = `${publicBaseUrl}/openai-app/styles.css`;
  const scriptUrl = `${publicBaseUrl}/openai-app/${input.entrypoint}.js`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <link rel="stylesheet" href="${stylesheetUrl}" />
  </head>
  <body>
    <div id="root"></div>
    <script>window.__OCTOPARSE_WIDGET_KIND__ = "${input.entrypoint}";</script>
    <script type="module" src="${scriptUrl}"></script>
  </body>
</html>`;
}

export const widgetResourceDefinitions: WidgetResourceDefinition[] = [
  {
    name: 'search-templates-widget',
    uri: SEARCH_TEMPLATES_WIDGET_URI,
    title: 'Template search widget',
    description: 'Visual template search results for OpenAI Apps SDK',
    htmlTitle: 'Template Search',
    entrypoint: 'search-templates',
    widgetDescription: 'This widget already shows the full template cards, pricing, tags, and run mode hints. Do not repeat the cards or metadata. Reply in Chinese with a 100-200 character summary only.'
  },
  {
    name: 'search-tasks-widget',
    uri: SEARCH_TASKS_WIDGET_URI,
    title: 'Task search widget',
    description: 'Visual task list results for OpenAI Apps SDK',
    htmlTitle: 'Task Search',
    entrypoint: 'search-tasks',
    widgetDescription: 'This widget already shows the full task list and status. Do not repeat the table rows. Reply in Chinese with a 100-200 character summary only.'
  }
];

export function renderWidgetResource(
  definition: WidgetResourceDefinition,
  uiPolicy: UiClientPolicy
): RenderedWidgetResource {
  if (uiPolicy.widgetResource.includeHtml && uiPolicy.widgetResource.includeOpenAiMeta) {
    return {
      uri: definition.uri,
      mimeType: uiPolicy.widgetResource.mimeType,
      text: buildWidgetHtml({
        title: definition.htmlTitle,
        entrypoint: definition.entrypoint
      }),
      _meta: buildOpenAiWidgetResourceMeta(definition.widgetDescription)
    };
  }

  return {
    uri: definition.uri,
    mimeType: uiPolicy.widgetResource.mimeType,
    text: ''
  };
}
