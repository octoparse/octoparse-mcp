import type { OctoparseApi } from '../api/octoparse.js';
import {
  type QueryByPhraseTemplateResultDto,
  RunOn,
  type TemplateVersionDetail,
  type TemplateView
} from '../api/types.js';
import { AppConfig } from '../config/app-config.js';
import { TemplateSchemaCacheService } from '../services/template-schema-cache-service.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import { Logger } from '../utils/logger.js';
import { buildInputSchemaForLlm } from './template-parameter-builder.js';
import { buildSourceSummary, buildTemplateSourceSchema } from './source-options-resolver.js';

const templateSearchLog = Logger.createNamedLogger('octoparse.tools.template-search');

export function templateSupportsCloudScraping(runOn: number | undefined | null): boolean {
  const n = Number(runOn);
  return n === RunOn.Cloud || n === RunOn.Both;
}

export function templateIsLocalOnly(runOn: number | undefined | null): boolean {
  const n = Number(runOn);
  return n === RunOn.Local;
}

export function getTemplateDisplayFields(template: QueryByPhraseTemplateResultDto): {
  displayName: string;
  shortDescription: string;
  imageUrl?: string;
} {
  const displayName = template.name || template.internalName || template.slug || '';
  const shortDescription = template.description || '';
  const imageUrl = template.imageUrl || undefined;

  return {
    displayName,
    shortDescription,
    ...(imageUrl ? { imageUrl } : {})
  };
}

export function buildRecommendedTemplateName(rawList: QueryByPhraseTemplateResultDto[]): string | null {
  const idx = rawList.findIndex((t) => templateSupportsCloudScraping(t.runOn));
  if (idx < 0) {
    return null;
  }

  const t = rawList[idx];
  return t.slug || '';
}

export function buildTopRelevanceLocalOnlyGuidance(
  top: QueryByPhraseTemplateResultDto,
  downloadUrl: string
) {
  const displayFields = getTemplateDisplayFields(top);
  return {
    situation: 'top_relevance_match_is_local_only',
    summary:
      'The top relevance match is local-only, so this MCP server cannot run it with execute_task.',
    template: {
      templateName: top.slug || '',
      displayName: displayFields.displayName,
      shortDescription: displayFields.shortDescription.slice(0, 120),
      ...(displayFields.imageUrl ? { imageUrl: displayFields.imageUrl } : {}),
      executionMode: EnumLabelUtil.runOnLabel(top.runOn),
      popularityLikes: top.likes ?? 0
    },
    downloadUrl,
    downloadInternationalSite: process.env.OCTOPARSE_DOWNLOAD_INTL_URL || 'https://www.octoparse.com/download',
    downloadChinaSite: process.env.OCTOPARSE_DOWNLOAD_CN_URL || 'https://www.bazhuayu.com/download'
  };
}

function parseTemplateOutputSchema(
  outputSchema: string | undefined,
  context: { templateId?: number; templateName?: string }
): unknown | undefined {
  if (!outputSchema || outputSchema.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(outputSchema);
  } catch (error) {
    templateSearchLog.warn('Failed to deserialize template outputSchema', {
      meta: {
        templateId: context.templateId,
        templateName: context.templateName,
        errorMessage: error instanceof Error ? error.message : 'unknown_error'
      }
    });
    return undefined;
  }
}

export function buildExactTemplateResult(
  templateView: TemplateView,
  versionDetail: Pick<TemplateVersionDetail, 'parameters' | 'outputSchema'> | undefined,
  downloadUrl: string,
  sourceSchemaEntry?: {
    sourceSchema: ReturnType<typeof buildTemplateSourceSchema>;
  }
) {
  const templateName = templateView.slug || '';
  const displayName = templateView.name || templateView.slug || String(templateView.id);
  const sourceSchema = sourceSchemaEntry?.sourceSchema;
  const sourceSummary = sourceSchema ? buildSourceSummary(sourceSchema) : null;
  const sourcePayload =
    sourceSchema && sourceSummary?.hasSourceOptions
      ? {
          sourceSummary,
          sourceOptions: sourceSchema.rootFieldOptions
        }
      : {};
  const parsedOutputSchema = parseTemplateOutputSchema(versionDetail?.outputSchema, {
    templateId: templateView.id,
    templateName
  });

  return {
    templateId: templateView.id,
    templateName,
    displayName,
    shortDescription: (templateView.prompts || '').slice(0, 160),
    executionMode: EnumLabelUtil.runOnLabel(templateView.runOn),
    inputSchema: buildInputSchemaForLlm(versionDetail?.parameters || templateView.parameters, {
      sourceSchema
    }),
    ...sourcePayload,
    ...(parsedOutputSchema !== undefined ? { outputSchema: parsedOutputSchema } : {}),
    ...(templateIsLocalOnly(templateView.runOn)
      ? {
          note: 'Local collection only. Download the Octoparse desktop client to use this template.',
          downloadUrl
        }
      : {})
  };
}

function extractTemplateId(
  templateView: Partial<TemplateView> | null | undefined,
  fallbackId?: number
): number | null {
  const rawId =
    templateView && typeof templateView === 'object'
      ? (templateView as { id?: unknown; templateId?: unknown }).id ??
        (templateView as { id?: unknown; templateId?: unknown }).templateId
      : fallbackId;
  const normalizedId = typeof rawId === 'number' ? rawId : Number(rawId);
  return Number.isFinite(normalizedId) && normalizedId > 0 ? normalizedId : null;
}

function coerceTemplateViewForExactLookup(
  templateView: Partial<TemplateView> | null | undefined,
  fallbackId?: number
): TemplateView | null {
  const templateId = extractTemplateId(templateView, fallbackId);
  if (!templateView || typeof templateView !== 'object' || templateId === null) {
    return null;
  }

  return {
    ...templateView,
    id: templateId
  } as TemplateView;
}

function buildTemplateViewFromSearchCandidate(
  candidate: QueryByPhraseTemplateResultDto
): TemplateView {
  const displayFields = getTemplateDisplayFields(candidate);
  return {
    id: candidate.id,
    slug: candidate.slug,
    name: displayFields.displayName,
    prompts: displayFields.shortDescription,
    runOn: candidate.runOn as RunOn | undefined,
    parameters: undefined
  };
}

export function buildTemplateVersionDetailMap(
  versionDetails: TemplateVersionDetail[]
): Map<number, TemplateVersionDetail> {
  return new Map(
    versionDetails
      .filter((detail) => Number.isFinite(detail.templateId) && detail.templateId > 0)
      .map((detail) => [detail.templateId, detail])
  );
}

export async function loadTemplateVersionDetailMap(
  api: OctoparseApi,
  templates: Array<Pick<QueryByPhraseTemplateResultDto, 'id'>>
): Promise<Map<number, TemplateVersionDetail>> {
  const templateIds = templates
    .map((template) => template.id)
    .filter((id) => Number.isFinite(id) && id > 0);

  if (templateIds.length === 0) {
    return new Map();
  }

  const versionDetails = await api.getTemplateCurrentVersions(templateIds);
  return buildTemplateVersionDetailMap(versionDetails);
}

export async function loadTemplateSchemaEntry(
  api: OctoparseApi,
  templateId: number,
  versionIdHint?: number
) {
  return TemplateSchemaCacheService.getOrLoad({
    templateId,
    versionIdHint,
    acceptLanguage: AppConfig.getHttpConfig().acceptLanguage,
    loader: async () => {
      const detail = await api.getTemplateCurrentVersion(templateId);
      return {
        id: detail.id,
        version: detail.version,
        templateId: detail.templateId,
        parameters: detail.parameters,
        outputSchema: detail.outputSchema,
        fieldDataSource: detail.fieldDataSource
      };
    }
  });
}

export async function resolveExactTemplateView(
  api: {
    getTemplateView?: (id: number) => Promise<TemplateView | null | undefined>;
    getTemplateBySlug?: (slug: string) => Promise<TemplateView | null | undefined>;
    searchTemplates?: (request: {
      keyword?: string;
      limit?: number;
      runOns?: string;
      isPublished?: boolean;
    }) => Promise<{ data?: QueryByPhraseTemplateResultDto[] }>;
  },
  input: { id?: number; slug?: string }
): Promise<{ templateView: TemplateView | null; queryMode: 'id' | 'slug'; lookupError?: Error }> {
  const exactId = input.id;
  const queryMode = exactId !== undefined ? ('id' as const) : ('slug' as const);
  let lookupError: Error | undefined;

  if (exactId !== undefined) {
    try {
      const directView = coerceTemplateViewForExactLookup(await api.getTemplateView?.(exactId), exactId);
      if (directView) {
        return { templateView: directView, queryMode };
      }
    } catch (error) {
      lookupError = error instanceof Error ? error : new Error('Template lookup failed');
    }

    try {
      const response = await api.searchTemplates?.({ keyword: String(exactId), limit: 20 });
      const matched = response?.data?.find((item) => item.id === exactId);
      if (matched) {
        return {
          templateView: buildTemplateViewFromSearchCandidate(matched),
          queryMode,
          lookupError
        };
      }
    } catch (error) {
      if (!lookupError) {
        lookupError = error instanceof Error ? error : new Error('Template lookup failed');
      }
    }

    return { templateView: null, queryMode, lookupError };
  }

  const slug = (input.slug || '').trim();
  try {
    const slugView = coerceTemplateViewForExactLookup(await api.getTemplateBySlug?.(slug));
    return { templateView: slugView, queryMode };
  } catch (error) {
    lookupError = error instanceof Error ? error : new Error('Template lookup failed');
    return { templateView: null, queryMode, lookupError };
  }
}
