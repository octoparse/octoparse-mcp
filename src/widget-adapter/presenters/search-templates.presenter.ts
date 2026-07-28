import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import messages from '../../config/messages.js';
import { createOpenAiWidgetToolResult } from '../ui-result.js';
import type { ToolUiBinding } from '../tool-ui-contract.js';

interface TemplateCard {
  templateName?: string;
  displayName?: string;
  shortDescription?: string;
  imageUrl?: string;
  templateRef?: {
    templateId?: number;
    templateName?: string;
    displayName?: string;
  };
  templateId?: number;
  executionMode?: string;
  popularityLikes?: number;
  pricePerData?: number | null;
  priceLabel?: string;
  lastModificationTime?: string | null;
  lastModifiedLabel?: string;
  note?: string;
  downloadUrl?: string;
  sourceOptions?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

interface SearchTemplatesLikeResult {
  success?: boolean;
  error?: string;
  message?: string;
  workflowHint?: unknown;
  queryMode?: string;
  template?: TemplateCard;
  templates?: TemplateCard[];
  recommendedTemplateName?: string | null;
  page?: number;
  pageSize?: number;
  totalMatchingTemplates?: number;
  totalPages?: number;
  topRelevanceMatchLocalOnly?: Record<string, unknown>;
  localCollectionGuidance?: Record<string, unknown>;
  noteLocalOnlyAlsoMatched?: Record<string, unknown>;
  noCloudTemplatesFound?: Record<string, unknown>;
}

function formatPriceLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || value <= 0) {
    return 'No Extra Cost';
  }
  return `$${value}/1000 lines`;
}

function formatDateLabel(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function inferTemplateIcon(template: TemplateCard): string {
  const haystack = `${template.displayName || ''} ${template.templateName || ''}`.toLowerCase();
  if (haystack.includes('google')) return 'search-engine';
  if (haystack.includes('map')) return 'maps';
  if (haystack.includes('social')) return 'social-media';
  if (haystack.includes('contact')) return 'contact';
  return 'generic-template';
}

function buildCards(result: SearchTemplatesLikeResult) {
  const rawCards = Array.isArray(result.templates)
    ? result.templates
    : result.template
      ? [result.template]
      : [];

  return rawCards.map((template) => ({
    templateName: template.templateName ?? '',
    displayName: template.displayName ?? template.templateName ?? '',
    shortDescription: template.shortDescription ?? '',
    imageUrl: template.imageUrl,
    templateRef: template.templateRef
      ? {
        templateId: template.templateRef.templateId,
        templateName: template.templateRef.templateName,
        displayName: template.templateRef.displayName
      }
      : {
        templateId: template.templateId,
        templateName: template.templateName ?? '',
        displayName: template.displayName ?? template.templateName ?? ''
      },
    executionMode: template.executionMode ?? 'Unknown',
    popularityLikes: template.popularityLikes ?? 0,
    priceLabel: template.priceLabel ?? formatPriceLabel(template.pricePerData),
    lastModifiedLabel: template.lastModifiedLabel ?? formatDateLabel(template.lastModificationTime),
    note: template.note,
    downloadUrl: template.downloadUrl,
    iconKey: inferTemplateIcon(template),
    sourceOptions: template.sourceOptions,
    inputSchema: template.inputSchema,
    outputSchema: template.outputSchema
  }));
}

function buildBanner(result: SearchTemplatesLikeResult): Record<string, unknown> | undefined {
  return (
    result.localCollectionGuidance ||
    result.topRelevanceMatchLocalOnly ||
    result.noteLocalOnlyAlsoMatched ||
    result.noCloudTemplatesFound
  );
}

function compactWidgetCard(card: ReturnType<typeof buildCards>[number]) {
  const {
    sourceOptions: _sourceOptions,
    inputSchema: _inputSchema,
    outputSchema: _outputSchema,
    ...compactCard
  } = card;

  return compactCard;
}

function omitTemplateRef(template: TemplateCard): TemplateCard {
  const {
    templateRef: _templateRef,
    ...structuredTemplate
  } = template;

  return structuredTemplate;
}

function buildStructuredTemplates(result: SearchTemplatesLikeResult): TemplateCard[] {
  if (Array.isArray(result.templates)) {
    return result.templates.map(omitTemplateRef);
  }

  return result.template ? [omitTemplateRef(result.template)] : [];
}

export function presentSearchTemplatesResult(
  result: SearchTemplatesLikeResult,
  binding: Pick<ToolUiBinding, 'resourceUri' | 'outputTemplate' | 'widgetAccessible'>
): CallToolResult {
  const cards = buildCards(result);
  const structuredTemplates = buildStructuredTemplates(result);
  const summary = result.success === false
    ? result.message || 'Template search failed.'
    : cards.length > 0
      ? `UI already shows the template cards. Found ${cards.length} template result${cards.length === 1 ? '' : 's'}.`
      : 'UI already shows the template cards. No template results matched the current query.';

  return createOpenAiWidgetToolResult({
    binding: {
      ...binding,
      widgetAccessible: binding.widgetAccessible ?? true
    },
    text: summary,
    structuredContent: {
      success: result.success !== false,
      ...(result.workflowHint !== undefined ? { workflowHint: result.workflowHint } : {}),
      queryMode: result.queryMode ?? 'keyword',
      recommendedTemplateName: result.recommendedTemplateName ?? null,
      page: result.page ?? 1,
      pageSize: result.pageSize ?? cards.length,
      totalMatchingTemplates: result.totalMatchingTemplates ?? cards.length,
      ...(result.totalPages !== undefined ? { totalPages: result.totalPages } : {}),
      widgetRendered: true,
      ...(result.template ? { template: omitTemplateRef(result.template) } : {}),
      templates: structuredTemplates,
      ...(result.topRelevanceMatchLocalOnly ? { topRelevanceMatchLocalOnly: result.topRelevanceMatchLocalOnly } : {}),
      ...(result.localCollectionGuidance ? { localCollectionGuidance: result.localCollectionGuidance } : {}),
      ...(result.noteLocalOnlyAlsoMatched ? { noteLocalOnlyAlsoMatched: result.noteLocalOnlyAlsoMatched } : {}),
      ...(result.noCloudTemplatesFound ? { noCloudTemplatesFound: result.noCloudTemplatesFound } : {}),
      ...(result.success === false && result.error ? { error: result.error, message: result.message } : {})
    },
    widgetData: {
      widgetType: 'search-templates',
      cards: cards.map(compactWidgetCard),
      useTemplatePromptTemplate: messages.tools.searchTemplates.useTemplatePromptTemplate,
      banner: buildBanner(result),
      queryMode: result.queryMode ?? 'keyword',
      pagination: {
        page: result.page ?? 1,
        pageSize: result.pageSize ?? cards.length,
        total: result.totalMatchingTemplates ?? cards.length
      }
    },
    isError: result.success === false
  });
}
