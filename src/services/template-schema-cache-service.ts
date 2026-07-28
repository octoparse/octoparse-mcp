import type { TemplateVersionDetail } from '../api/types.js';
import { AppConfig } from '../config/app-config.js';
import {
  buildTemplateSourceSchema,
  type TemplateSourceSchema
} from '../tools/source-options-resolver.js';
import { Logger } from '../utils/logger.js';
import { RedisClient } from '../utils/redis.js';

export interface TemplateSchemaCacheEntry {
  templateId: number;
  versionId: number;
  version?: number;
  acceptLanguage: string;
  parameters?: string;
  outputSchema?: string;
  fieldDataSource?: string;
  sourceSchema: TemplateSourceSchema;
}

interface GetOrLoadTemplateSchemaInput {
  templateId: number;
  versionIdHint?: number;
  acceptLanguage: string;
  loader: () => Promise<Pick<TemplateVersionDetail, 'id' | 'version' | 'templateId' | 'parameters' | 'outputSchema' | 'fieldDataSource'>>;
}

export class TemplateSchemaCacheService {
  private static readonly CACHE_KEY_PREFIX = 'template-schema:v1:';

  public static async getOrLoad(
    input: GetOrLoadTemplateSchemaInput
  ): Promise<TemplateSchemaCacheEntry> {
    const redis = RedisClient.getInstance();
    const cacheKey = this.buildCacheKey(
      input.templateId,
      input.acceptLanguage,
      input.versionIdHint
    );

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return this.normalizeCacheEntry(JSON.parse(cached) as Partial<TemplateSchemaCacheEntry>);
        }
      } catch (error) {
        Logger.logError(
          '[TemplateSchemaCacheService] Failed to read cache entry',
          error as Error,
          { meta: { templateId: input.templateId } }
        );
      }
    }

    const versionDetail = await input.loader();
    const entry = this.buildCacheEntry(versionDetail, input.acceptLanguage);

    if (redis) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(entry),
          'EX',
          AppConfig.getRedisConfig().templateSchemaCacheTTL
        );
      } catch (error) {
        Logger.logError(
          '[TemplateSchemaCacheService] Failed to persist cache entry',
          error as Error,
          { meta: { templateId: input.templateId } }
        );
      }
    }

    return entry;
  }

  private static buildCacheEntry(
    versionDetail: Pick<TemplateVersionDetail, 'id' | 'version' | 'templateId' | 'parameters' | 'outputSchema' | 'fieldDataSource'>,
    acceptLanguage: string
  ): TemplateSchemaCacheEntry {
    const templateId = Number(versionDetail.templateId);
    const versionId = Number(versionDetail.id);

    return {
      templateId,
      versionId,
      version: versionDetail.version,
      acceptLanguage,
      parameters: versionDetail.parameters,
      outputSchema: versionDetail.outputSchema,
      fieldDataSource: versionDetail.fieldDataSource,
      sourceSchema: buildTemplateSourceSchema({
        templateId,
        versionId,
        acceptLanguage,
        parametersJson: versionDetail.parameters,
        fieldDataSource: versionDetail.fieldDataSource
      })
    };
  }

  private static normalizeCacheEntry(
    cached: Partial<TemplateSchemaCacheEntry>
  ): TemplateSchemaCacheEntry {
    const sourceSchema = cached.sourceSchema;

    return {
      templateId: Number(cached.templateId ?? sourceSchema?.templateId ?? 0),
      versionId: Number(cached.versionId ?? sourceSchema?.versionId ?? 0),
      version: cached.version,
      acceptLanguage: cached.acceptLanguage ?? sourceSchema?.acceptLanguage ?? 'en-US',
      parameters: cached.parameters,
      outputSchema: cached.outputSchema,
      fieldDataSource: cached.fieldDataSource,
      sourceSchema: {
        templateId: Number(sourceSchema?.templateId ?? cached.templateId ?? 0),
        versionId: Number(sourceSchema?.versionId ?? cached.versionId ?? 0),
        acceptLanguage: sourceSchema?.acceptLanguage ?? cached.acceptLanguage ?? 'en-US',
        fieldKeyMap: sourceSchema?.fieldKeyMap ?? {},
        rootFieldOptions: sourceSchema?.rootFieldOptions ?? {},
        dependencyOptionIndex: sourceSchema?.dependencyOptionIndex ?? {}
      }
    };
  }

  private static buildCacheKey(
    templateId: number,
    acceptLanguage: string,
    versionIdHint?: number
  ): string {
    const versionKey =
      typeof versionIdHint === 'number' && Number.isFinite(versionIdHint) && versionIdHint > 0
        ? String(versionIdHint)
        : 'current';

    return `${this.CACHE_KEY_PREFIX}${encodeURIComponent(String(templateId))}:${encodeURIComponent(acceptLanguage)}:${encodeURIComponent(versionKey)}`;
  }
}
