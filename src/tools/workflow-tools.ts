/**
 * Octoparse MCP — workflow orchestration tools
 *
 * API mapping (OpenAPI / ClientAPI → tool behavior):
 *
 * 1) search_templates
 *    - Request:  GET /api/templateservice/templates/queryByPhrase?queryPhrase={keyword}
 *    - Response: { data: QueryByPhraseTemplateResultDto[] } (relevance order)
 *    - Tool maps: cloud-first template search with local-only fallback; exposes `workflowHint`
 *      and `recommendedTemplateName` so callers can locate the best cloud-capable result in `templates`.
 *      Search first requests cloud-capable templates (runOn=2,3). If fewer than `limit`, it appends local-only
 *      templates (runOn=1) and includes desktop download guidance.
 *
 * 2) execute_task
 *    - Input **templateName** aligns with search_templates. Legacy alias **slug** is accepted server-side but not exposed in schema. Callers should use `inputSchema[].field` as the parameter key contract; layout/chrome controls get defaults server-side (UIParameters still paired in builder).
 *    - Optional **targetMaxRows > 0**: when progress extCnt ≥ target, calls **stopTask** then waits for **Stopped** and preview-export (overshoot between polls — see tool description; summary uses extCnt/dataCnt). `0` means no threshold stop.
 *    - Milestones + **completed** / **failed** / **timeout** (poll cap via env EXECUTE_TASK_POLL_MAX_MINUTES, default 10 min).
 *
 * `export_data` is implemented in export-data-tool.ts and remains the authoritative follow-up after execute_task timeout/completion.
 */

import { z } from 'zod';
import type {
  CallToolResult,
  CreateTaskResult,
  GetTaskResult
} from '@modelcontextprotocol/sdk/types.js';
import { ToolDefinition } from './tool-definition.js';
import { OctoparseApi } from '../api/octoparse.js';
import {
  RunOn,
  StartTaskResult,
  TemplateVersionDetail,
} from '../api/types.js';
import { AppConfig } from '../config/app-config.js';
import messages from '../config/messages.js';
import {
  getStartTaskErrorMessage,
  getPlanUpgradeUrl,
  getTrialTemplateCollectLimitUpgradeMessage,
  isTrialTemplateTaskCollectLimitError
} from '../errors/task-errors.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import { Logger } from '../utils/logger.js';
import {
  buildInputSchemaForLlm,
} from './template-parameter-builder.js';
import {
  buildSourceSummary,
  buildTemplateSourceSchema
} from './source-options-resolver.js';
import {
  DEFAULT_TEMPLATE_SEARCH_LIMIT,
  SEARCH_WORKFLOW_HINT,
  sanitizeTemplateTaskCreationError
} from './workflow-hints.js';
import { runTemplateExecutionPreflight } from './template-execution-preflight.js';
import * as TemplateSearchService from './template-search-service.js';
import { createExecutionTaskAuthStore } from '../tasks/execution-task-auth.js';
import { ExecutionTaskService } from '../tasks/execution-task-service.js';
import { ExecutionTaskWorker } from '../tasks/execution-task-worker.js';
import type { PreparedExecutionTask } from '../tasks/mcp-task-adapter.js';
import { SEARCH_TEMPLATES_WIDGET_URI } from '../widget-adapter/resource-registry.js';
import { presentSearchTemplatesResult } from '../widget-adapter/presenters/search-templates.presenter.js';

/** Default delay between getTaskStatus polls (balance: API load vs responsiveness). */
const POLL_INTERVAL_MS = 2500;
/** When targetMaxRows is set, poll a bit faster so stop/export happens sooner after the count threshold. */
const POLL_INTERVAL_MS_WITH_TARGET_MAX_ROWS = 1500;

/** Progressive steps for the LLM (keep small for tokens). */
const EXECUTE_TASK_MILESTONE_CAP = 16;
const NON_TASK_EXPORT_POLL_MIN_SECONDS = 10;
const NON_TASK_EXPORT_POLL_MAX_SECONDS = 30;
const workflowLog = Logger.createNamedLogger('octoparse.tools.workflow');

interface ExecuteTaskMilestone {
  step: string;
  label: string;
  at: string;
  detail?: string;
  rawStatus?: string;
  workflowStatus?: string;
  taskId?: string;
  extractedCount?: number | null;
}

interface WorkflowToolError {
  success: false;
  error: string;
  message: string;
  recoverable?: boolean;
  requiresUserAction?: boolean;
  [key: string]: unknown;
}

function buildNonTaskExportRetryInstruction(taskId: string): string {
  return `Wait about ${NON_TASK_EXPORT_POLL_MIN_SECONDS}-${NON_TASK_EXPORT_POLL_MAX_SECONDS} seconds, then call export_data(taskId="${taskId}") to begin polling collection and export progress.`;
}

function normalizeExecuteTaskParameters(raw: unknown): Record<string, unknown> {
  if (raw == null) {
    return {};
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('parameters must be a valid JSON object string when passed as text.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('parameters must deserialize to a JSON object.');
    }

    return parsed as Record<string, unknown>;
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  throw new Error('parameters must be an object or a JSON object string.');
}

function prepareExecuteTaskParametersForStringSchema(raw: unknown): unknown {
  if (raw == null) {
    return '';
  }

  if (typeof raw === 'string') {
    return raw;
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return JSON.stringify(raw);
  }

  throw new Error('parameters must be a JSON object string.');
}

function inferImmediateTaskTerminalStatus(
  response: WorkflowToolError | Record<string, unknown>
): 'completed' | 'failed' {
  return response.success === false ? 'failed' : 'completed';
}

function toImmediateTaskCallToolResult(
  response: WorkflowToolError | Record<string, unknown>
): CallToolResult {
  const fallbackText = JSON.stringify(response, null, 2);
  const text =
    typeof response.message === 'string' && response.message.trim().length > 0
      ? response.message
      : fallbackText;

  return {
    content: [
      {
        type: 'text',
        text
      }
    ],
    structuredContent: response,
    ...(response.success === false ? { isError: true } : {})
  };
}

async function createImmediateTaskResult(
  taskStore: {
    createTask(taskParams: {
      ttl?: number | null;
      pollInterval?: number;
      context?: Record<string, unknown>;
    }): Promise<CreateTaskResult['task']>;
    getTask(taskId: string): Promise<CreateTaskResult['task']>;
    storeTaskResult(taskId: string, status: 'completed' | 'failed', result: CallToolResult): Promise<void>;
    updateTaskStatus(taskId: string, status: 'completed' | 'failed', statusMessage?: string): Promise<void>;
  },
  response: WorkflowToolError | Record<string, unknown>
): Promise<CreateTaskResult> {
  const task = await taskStore.createTask({
    ttl: defaultTaskConfig.resultTtlMs,
    pollInterval: defaultTaskConfig.pollIntervalMs
  });
  const terminalStatus = inferImmediateTaskTerminalStatus(response);
  const message = typeof response.message === 'string' ? response.message : undefined;

  await taskStore.updateTaskStatus(task.taskId, terminalStatus, message);
  await taskStore.storeTaskResult(
    task.taskId,
    terminalStatus,
    toImmediateTaskCallToolResult(response)
  );

  return {
    task: await taskStore.getTask(task.taskId)
  };
}

async function resolveApiInstance(
  apiOrFactory: OctoparseApi | (() => Promise<OctoparseApi | undefined>) | undefined
): Promise<OctoparseApi | undefined> {
  if (typeof apiOrFactory === 'function') {
    return apiOrFactory();
  }
  return apiOrFactory;
}

function pushExecuteTaskMilestone(
  list: ExecuteTaskMilestone[],
  step: string,
  label: string,
  extra?: Partial<Omit<ExecuteTaskMilestone, 'step' | 'label' | 'at'>>
): void {
  if (list.length >= EXECUTE_TASK_MILESTONE_CAP) {
    return;
  }
  const milestone = {
    step,
    label,
    at: new Date().toISOString(),
    ...extra
  };
  list.push(milestone);
}

function buildWorkflowToolError(
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
): WorkflowToolError {
  return {
    success: false,
    error,
    message,
    ...extra
  };
}

function extractWebsiteHint(templateName: string): string {
  return templateName.split(/\s+/).filter(Boolean)[0] || templateName;
}

/** Official marketing pages (override via env if needed) */
const MARKETING_SITE_INTL = process.env.OCTOPARSE_MARKETING_INTL_URL || 'https://www.octoparse.com/';
const MARKETING_SITE_CN = process.env.OCTOPARSE_MARKETING_CN_URL || 'https://www.bazhuayu.com/';
const DOWNLOAD_SITE_INTL =
  process.env.OCTOPARSE_DOWNLOAD_INTL_URL || 'https://www.octoparse.com/download';
const DOWNLOAD_SITE_CN =
  process.env.OCTOPARSE_DOWNLOAD_CN_URL || 'https://www.bazhuayu.com/download';

function templateIsLocalOnly(runOn: number | undefined | null): boolean {
  const n = Number(runOn);
  return n === RunOn.Local;
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
    workflowLog.warn('Failed to deserialize template outputSchema', {
      meta: {
        templateId: context.templateId,
        templateName: context.templateName,
        errorMessage: error instanceof Error ? error.message : 'unknown_error'
      }
    });
    return undefined;
  }
}

function getStartTaskResultDescription(result: number | undefined): string {
  switch (result) {
    case StartTaskResult.SUCCESS:
      return 'Task started successfully';
    case StartTaskResult.ALREADY_RUNNING:
      return 'Task is already running';
    case StartTaskResult.TASK_NOT_FOUND:
      return 'Task not found';
    case StartTaskResult.INSUFFICIENT_CREDITS:
    case StartTaskResult.USER_CREDIT_INSUFFICIENT:
      return 'Insufficient credits';
    case StartTaskResult.TASK_DISABLED:
      return 'Task disabled or template not runnable on cloud';
    case StartTaskResult.RATE_LIMIT_EXCEEDED:
      return 'Rate limit exceeded';
    case StartTaskResult.USER_INSUFFICIENT_PERMISSION:
      return 'Insufficient permissions';
    default:
      return 'Unknown start result';
  }
}

export const searchTemplateTool: ToolDefinition = {
  name: 'search_templates',
  title: messages.tools.searchTemplates.title,
  description: messages.tools.searchTemplates.description,
  requiresAuth: true,
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: false },
  uiBinding: {
    resourceUri: SEARCH_TEMPLATES_WIDGET_URI,
    widgetTitle: 'Template Search Results',
    widgetDescription: 'Visual template cards for OpenAI Apps SDK.',
    widgetAccessible: true,
    invokingText: 'Searching Octoparse templates...',
    invokedText: 'Template search results are ready.',
    presenter: (result) =>
      presentSearchTemplatesResult(result as Record<string, unknown>, {
        resourceUri: SEARCH_TEMPLATES_WIDGET_URI
      })
  },
  inputSchema: z
    .object({
      keyword: z
        .string()
        .optional()
        .describe('Use for topic, site, or use-case search.'),
      id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Exact template id lookup.'),
      slug: z
        .string()
        .optional()
        .describe('Exact template slug / alias lookup.'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Keyword mode only. 1-based page number.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(DEFAULT_TEMPLATE_SEARCH_LIMIT)
        .describe(
          `Keyword mode only. Max templates per page. Default ${DEFAULT_TEMPLATE_SEARCH_LIMIT}.`
        )
    })
    .superRefine((value, ctx) => {
      const id = value.id;
      const selectorCount = [value.keyword, id, value.slug].filter(
        (item) => item !== undefined && item !== ''
      ).length;
      if (selectorCount > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Use only one of keyword, id, or slug in a single call.'
        });
      }
    }),
  handler: async (input, apiOrFactory) => {
    const api = await resolveApiInstance(apiOrFactory);
    if (!api) {
      throw new Error('API instance required');
    }

    const downloadUrl = AppConfig.getApiConfig().downloadUrl;
    const exactId = input.id;

    if (exactId !== undefined || input.slug) {
      try {
        const { templateView, queryMode, lookupError } = await TemplateSearchService.resolveExactTemplateView(api, input);
        if (!templateView) {
          throw lookupError ??
          new Error(
            queryMode === 'id'
              ? `Template id ${exactId} not found`
              : `Template slug "${(input.slug || '').trim()}" not found`
          );
        }

        const schemaEntry = await TemplateSearchService.loadTemplateSchemaEntry(
          api,
          templateView.id,
          templateView.currentVersion?.templateVersionId
        );
        const versionDetail = {
          parameters: schemaEntry.parameters,
          outputSchema: schemaEntry.outputSchema
        };
        const exactTemplate = TemplateSearchService.buildExactTemplateResult(
          templateView,
          versionDetail,
          downloadUrl,
          schemaEntry
        );

        return {
          success: true,
          workflowHint: SEARCH_WORKFLOW_HINT,
          queryMode,
          template: exactTemplate
        };
      } catch (e) {
        return buildWorkflowToolError(
          'template_resolution_failed',
          e instanceof Error ? e.message : 'Template not found',
          {
            recoverable: true,
            queryMode: exactId !== undefined ? 'id' : 'slug',
            recoverySuggestion:
              exactId !== undefined
                ? 'Verify the template id, or retry with keyword search.'
                : 'Verify the slug / alias, or retry with keyword search.'
          }
        );
      }
    }

    const page = input.page ?? 1;
    const limit = input.limit ?? DEFAULT_TEMPLATE_SEARCH_LIMIT;
    const fetchLimit = page * limit;

    const cloudResponse = await api.searchTemplates({
      keyword: input.keyword,
      limit: fetchLimit,
      runOns: '2,3'
    });
    const cloudResults = cloudResponse.data || [];

    const localFetchLimit = Math.max(0, fetchLimit - cloudResults.length);
    const localResponse =
      localFetchLimit > 0
        ? await api.searchTemplates({
          keyword: input.keyword,
          limit: localFetchLimit,
          runOns: '1'
        })
        : { data: [] };
    const localOnlyMatches = localResponse.data || [];

    const rawList = [...cloudResults, ...localOnlyMatches];
    const recommendedTemplateName = TemplateSearchService.buildRecommendedTemplateName(cloudResults);
    const totalMatching = rawList.length;
    const totalPages = Math.max(1, Math.ceil(totalMatching / Math.max(limit, 1)));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const slice = rawList.slice(start, start + limit);
    const templateVersionDetailMap = await TemplateSearchService.loadTemplateVersionDetailMap(api, slice);

    const templates = slice.map((t) => {
      const displayFields = TemplateSearchService.getTemplateDisplayFields(t);
      const versionDetail = templateVersionDetailMap.get(t.id);
      const sourceSchema = buildTemplateSourceSchema({
        templateId: t.id,
        versionId: versionDetail?.id || 0,
        acceptLanguage: AppConfig.getHttpConfig().acceptLanguage,
        parametersJson: versionDetail?.parameters,
        fieldDataSource: versionDetail?.fieldDataSource
      });
      const sourceSummary = buildSourceSummary(sourceSchema);
      const parsedOutputSchema = parseTemplateOutputSchema(versionDetail?.outputSchema, {
        templateId: t.id,
        templateName: t.slug || ''
      });
      const isLocalOnly = templateIsLocalOnly(t.runOn);

      return {
        templateId: t.id,
        templateName: t.slug || '',
        displayName: displayFields.displayName,
        shortDescription: displayFields.shortDescription.slice(0, 120),
        ...(displayFields.imageUrl ? { imageUrl: displayFields.imageUrl } : {}),
        executionMode: EnumLabelUtil.runOnLabel(t.runOn),
        popularityLikes: t.likes ?? 0,
        pricePerData: t.pricePerData ?? null,
        lastModificationTime: t.lastModificationTime ?? null,
        inputSchema: buildInputSchemaForLlm(versionDetail?.parameters, { sourceSchema }),
        ...(sourceSummary.hasSourceOptions
          ? {
            sourceSummary
          }
          : {}),
        ...(parsedOutputSchema !== undefined
          ? { outputSchema: parsedOutputSchema }
          : {}),
        ...(isLocalOnly
          ? {
            note: 'Local collection only. Download the Octoparse desktop client to use this template.',
            downloadUrl
          }
          : {})
      };
    });

    const topRelevanceLocalOnly =
      cloudResults.length === 0 && localOnlyMatches.length > 0
        ? localOnlyMatches[0]
        : undefined;
    const topRelevanceMatchLocalOnly = topRelevanceLocalOnly
      ? TemplateSearchService.buildTopRelevanceLocalOnlyGuidance(topRelevanceLocalOnly, downloadUrl)
      : undefined;

    // Keyword matched templates, but none support cloud — only local-only hits
    if (cloudResults.length === 0 && localOnlyMatches.length > 0) {
      const preview = templates.map((t) => ({
        ...t,
        note: 'Local collection only — install the Octoparse desktop client from the official site; not available for execute_task on this MCP server.',
        downloadUrl
      }));

      return {
        success: true,
        workflowHint: SEARCH_WORKFLOW_HINT,
        recommendedTemplateName,
        page: 1,
        pageSize: limit,
        totalMatchingTemplates: localOnlyMatches.length,
        totalPages: 1,
        templates: preview,
        ...(topRelevanceMatchLocalOnly ? { topRelevanceMatchLocalOnly } : {}),
        localCollectionGuidance: {
          situation: 'local_only_templates_matched_no_cloud',
          summary:
            'Your search matched template(s) that support **local (desktop) collection only**. This MCP server can only run **cloud-capable** templates via execute_task. Install the Octoparse desktop client from the official website for local scraping and a fuller feature set.',
          downloadUrl,
          downloadInternationalSite: DOWNLOAD_SITE_INTL,
          downloadChinaSite: DOWNLOAD_SITE_CN,
          matchedLocalOnlyCount: localOnlyMatches.length,
          /** Top local-only matches for reference (not usable with execute_task here) */
          localOnlyPreview: preview
        }
      };
    }

    // No templates at all for this keyword
    if (cloudResults.length === 0 && rawList.length === 0) {
      return {
        success: true,
        workflowHint: SEARCH_WORKFLOW_HINT,
        recommendedTemplateName,
        page: 1,
        pageSize: limit,
        totalMatchingTemplates: 0,
        totalPages: 1,
        templates: [],
        noCloudTemplatesFound: {
          situation: 'no_templates_matched',
          message:
            'No templates matched this keyword. Try a different keyword or browse templates in the Octoparse template library from the official website.',
          browseInternationalSite: MARKETING_SITE_INTL,
          browseChinaSite: MARKETING_SITE_CN
        }
      };
    }

    // Has cloud results; rawList had items but all were neither cloud nor local? (e.g. unknown runOn)
    if (cloudResults.length === 0 && localOnlyMatches.length === 0 && rawList.length > 0) {
      return {
        success: true,
        workflowHint: SEARCH_WORKFLOW_HINT,
        recommendedTemplateName,
        page: 1,
        pageSize: limit,
        totalMatchingTemplates: 0,
        totalPages: 1,
        templates: [],
        noCloudTemplatesFound: {
          situation: 'ambiguous_run_mode',
          message:
            'Templates were returned but run mode could not be classified as cloud-capable or local-only. Try another keyword or check templates in the Octoparse console.',
          browseInternationalSite: MARKETING_SITE_INTL,
          browseChinaSite: MARKETING_SITE_CN
        }
      };
    }

    return {
      success: true,
      workflowHint: SEARCH_WORKFLOW_HINT,
      recommendedTemplateName,
      page: safePage,
      pageSize: limit,
      totalMatchingTemplates: totalMatching,
      totalPages,
      templates,
      ...(topRelevanceMatchLocalOnly ? { topRelevanceMatchLocalOnly } : {}),
      ...(localOnlyMatches.length > 0
        ? {
          noteLocalOnlyAlsoMatched: {
            count: localOnlyMatches.length,
            hint: 'This keyword also matched local-only templates. Download the Octoparse desktop client if the user wants local collection.',
            downloadUrl,
            downloadInternationalSite: DOWNLOAD_SITE_INTL,
            downloadChinaSite: DOWNLOAD_SITE_CN
          }
        }
        : {})
    };
  }
};

/** Normalizes legacy `slug` input to `templateName` (canonical field for execute_task). */
const executeTaskInputSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const tn = o.templateName;
      const slug = o.slug;
      const tnEmpty =
        tn === undefined || tn === null || (typeof tn === 'string' && tn.trim() === '');
      if (tnEmpty && slug != null && String(slug).trim() !== '') {
        return { ...o, templateName: String(slug).trim() };
      }
    }
    return raw;
  },
  z.object({
    templateName: z
      .string()
      .min(1)
      .describe(
        'Template name from search_templates. Prefer `recommendedTemplateName`, exact `template.templateName`, or `templates[].templateName`.'
      ),
    taskName: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional friendly task name. Strongly recommended for long-running jobs because it makes task recovery easier if the client times out before you capture the returned taskId.'
      ),
    parameters: z
      .preprocess(
        (value) => prepareExecuteTaskParametersForStringSchema(value),
        z.string().transform((value) => normalizeExecuteTaskParameters(value))
      )
      .optional()
      .default({})
      .describe(
        'Business parameters as a JSON object string. Use `inputSchema[].field` as keys. For source-backed fields, pass the selected source option `key` as the field value. MultiInput = array of strings. Example: "{\\"search_keyword\\":[\\"phone\\"],\\"site\\":\\"United States\\"}"'
      ),
    targetMaxRows: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .optional()
      .describe(
        `Optional. Use a positive number to request stopTask after cloud extracted count reaches that threshold (see tool description for overshoot; polls ~${POLL_INTERVAL_MS_WITH_TARGET_MAX_ROWS / 1000}s when this is set). Use 0 or omit the field to let the task run until natural completion or timeout handling.`
      ),
    validateOnly: z
      .boolean()
      .optional()
      .describe(
        'Optional. Validate templateName and parameters only. Returns inputSchema and normalized parameter preview without creating or starting a task. If the template has dependent source-backed fields, validateOnly can also return next-level sourceOptions for the current selections.'
      )
  })
);

type ExecuteTaskInput = z.infer<typeof executeTaskInputSchema>;

type ExecuteTaskPreparation =
  | {
      kind: 'response';
      response: WorkflowToolError | Record<string, unknown>;
    }
  | {
      kind: 'prepared';
      preparedExecution: PreparedExecutionTask;
    };

interface ExecuteTaskServiceLike {
  createTask(input: {
    preparedExecution: PreparedExecutionTask;
    extra: unknown;
  }): Promise<CreateTaskResult>;
  getTask(input: unknown, getApi: unknown, extra: unknown): Promise<GetTaskResult>;
  getTaskResult(input: unknown, getApi: unknown, extra: unknown): Promise<CallToolResult>;
}

interface CreateExecuteTaskToolOptions {
  executionTaskService?: ExecuteTaskServiceLike;
}

const defaultTaskConfig = AppConfig.getTaskConfig();
const defaultExecutionTaskAuthStore = createExecutionTaskAuthStore({
  defaultTtlMs: defaultTaskConfig.credentialHandleTtlMs
});
const defaultExecutionTaskWorker = new ExecutionTaskWorker({
  authStore: defaultExecutionTaskAuthStore,
  pollIntervalMs: defaultTaskConfig.pollIntervalMs,
  pollIntervalWithTargetMaxRowsMs: Math.max(100, Math.min(1500, 3000)),
  lockTtlMs: defaultTaskConfig.lockTtlMs
});
const defaultExecutionTaskService = new ExecutionTaskService({
  authStore: defaultExecutionTaskAuthStore,
  worker: defaultExecutionTaskWorker,
  credentialHandleTtlMs: defaultTaskConfig.credentialHandleTtlMs,
  taskTtlMs: defaultTaskConfig.resultTtlMs,
  taskPollIntervalMs: defaultTaskConfig.pollIntervalMs
});

async function prepareExecuteTaskExecution(
  input: ExecuteTaskInput,
  api: OctoparseApi
): Promise<ExecuteTaskPreparation> {
  const paramMap = (input.parameters ?? {}) as Record<string, unknown>;
  let templateView;
  try {
    templateView = await api.getTemplateBySlug(input.templateName.trim());
  } catch (e) {
    return {
      kind: 'response',
      response: buildWorkflowToolError(
        'template_resolution_failed',
        e instanceof Error ? e.message : 'Template not found',
        {
          recoverable: true,
          operation: 'resolving template by templateName',
          recoverySuggestion:
            'Call search_templates with a keyword and use an exact templateName from the results.'
        }
      )
    };
  }

  const templateId = templateView.id;

  if (templateView.runOn === RunOn.Local) {
    const resolvedTemplateName = templateView.name || input.templateName;
    return {
      kind: 'response',
      response: buildWorkflowToolError(
        'template_local_only',
        `Template "${resolvedTemplateName}" is local-only and cannot be run with execute_task.`,
        {
          recoverable: true,
          templateId,
          templateName: resolvedTemplateName,
          suggestedNextCall: {
            tool: 'search_templates' as const,
            args: { keyword: extractWebsiteHint(resolvedTemplateName) }
          },
          downloadInternationalSite: DOWNLOAD_SITE_INTL,
          downloadChinaSite: DOWNLOAD_SITE_CN
        }
      )
    };
  }

  const schemaEntry = await TemplateSearchService.loadTemplateSchemaEntry(
    api,
    templateId,
    templateView.currentVersion?.templateVersionId
  );
  const versionDetail: TemplateVersionDetail = {
    id: schemaEntry.versionId,
    version: schemaEntry.version ?? templateView.currentVersion?.version ?? 0,
    templateId,
    parameters: schemaEntry.parameters,
    outputSchema: schemaEntry.outputSchema,
    fieldDataSource: schemaEntry.fieldDataSource
  };
  const paramsJson = schemaEntry.parameters || templateView.parameters || null;
  const preflight = runTemplateExecutionPreflight({
    templateParametersJson: paramsJson,
    sourceSchema: schemaEntry.sourceSchema,
    paramMap
  });

  if (preflight.errorCode === 'invalid_source_selection') {
    return {
      kind: 'response',
      response: {
        success: false,
        error: 'invalid_source_selection',
        recoverable: true,
        inputSchema: preflight.inputSchema,
        invalidSourceSelections: preflight.invalidSourceSelections,
        status: preflight.status,
        canExecuteNow: preflight.canExecuteNow,
        blockingIssues: preflight.blockingIssues,
        nextAction: preflight.nextAction,
        message: preflight.validationMessage
      }
    };
  }

  if (preflight.errorCode === 'missing_required_parameters') {
    if (input.validateOnly && preflight.status === 'awaiting_source_selection') {
      return {
        kind: 'response',
        response: {
          success: true,
          validateOnly: true,
          status: preflight.status,
          canExecuteNow: preflight.canExecuteNow,
          blockingIssues: preflight.blockingIssues,
          nextAction: preflight.nextAction,
          templateId,
          templateName: input.templateName,
          message:
            'Template parameters are partially validated, but dependent source-backed selections are still required before execution.',
          inputSchema: preflight.inputSchema,
          ...(preflight.parameterKeyMappings.length > 0
            ? { parameterKeyMappings: preflight.parameterKeyMappings }
            : {}),
          normalizedParametersPreview: preflight.normalizedParametersPreview,
          sourceSummary: preflight.sourceSummary,
          sourceOptions: preflight.sourceOptions,
          awaitingDependency: preflight.awaitingDependency,
          invalidSourceSelections: preflight.invalidSourceSelections
        }
      };
    }

    return {
      kind: 'response',
      response: {
        success: false,
        error: 'missing_required_parameters',
        recoverable: true,
        status: preflight.status,
        canExecuteNow: preflight.canExecuteNow,
        blockingIssues: preflight.blockingIssues,
        nextAction: preflight.nextAction,
        missingParamNames: preflight.missingParamNames,
        inputSchema: preflight.inputSchema,
        ...(preflight.parameterKeyMappings.length > 0
          ? { parameterKeyMappings: preflight.parameterKeyMappings }
          : {}),
        ...(preflight.ignoredParameterKeys.length > 0
          ? { ignoredParameterKeys: preflight.ignoredParameterKeys }
          : {}),
        message: preflight.validationMessage
      }
    };
  }

  if (preflight.errorCode === 'unmapped_parameters') {
    return {
      kind: 'response',
      response: {
        success: false,
        error: 'unmapped_parameters',
        recoverable: true,
        status: preflight.status,
        canExecuteNow: preflight.canExecuteNow,
        blockingIssues: preflight.blockingIssues,
        nextAction: preflight.nextAction,
        ignoredParameterKeys: preflight.meaningfulIgnoredKeys,
        inputSchema: preflight.inputSchema,
        ...(preflight.parameterKeyMappings.length > 0
          ? { parameterKeyMappings: preflight.parameterKeyMappings }
          : {}),
        message: preflight.validationMessage
      }
    };
  }

  if (preflight.errorCode === 'preflight_validation_failed') {
    return {
      kind: 'response',
      response: {
        success: false,
        error: 'preflight_validation_failed',
        recoverable: true,
        status: preflight.status,
        canExecuteNow: preflight.canExecuteNow,
        blockingIssues: preflight.blockingIssues,
        nextAction: preflight.nextAction,
        inputSchema: preflight.inputSchema,
        ...(preflight.parameterKeyMappings.length > 0
          ? { parameterKeyMappings: preflight.parameterKeyMappings }
          : {}),
        message: preflight.validationMessage
      }
    };
  }

  if (input.validateOnly) {
    return {
      kind: 'response',
      response: {
        success: true,
        validateOnly: true,
        status: preflight.status,
        canExecuteNow: preflight.canExecuteNow,
        blockingIssues: preflight.blockingIssues,
        nextAction: preflight.nextAction,
        templateId,
        templateName: input.templateName,
        message: 'Template parameters validated successfully. No task was created.',
        inputSchema: preflight.inputSchema,
        ...(preflight.parameterKeyMappings.length > 0
          ? { parameterKeyMappings: preflight.parameterKeyMappings }
          : {}),
        normalizedParametersPreview: preflight.normalizedParametersPreview,
        sourceSummary: preflight.sourceSummary,
        sourceOptions: preflight.sourceOptions,
        awaitingDependency: preflight.awaitingDependency,
        invalidSourceSelections: preflight.invalidSourceSelections
      }
    };
  }

  return {
    kind: 'prepared',
    preparedExecution: {
      templateId,
      templateName: input.templateName,
      taskName: input.taskName,
      userInputParameters: preflight.userInputParameters,
      templateView,
      templateVersionDetail: versionDetail,
      parameterKeyMappings: preflight.parameterKeyMappings,
      ignoredParameterKeys: preflight.ignoredParameterKeys,
      targetMaxRows:
        typeof input.targetMaxRows === 'number' && input.targetMaxRows > 0
          ? input.targetMaxRows
          : undefined
    }
  };
}

async function executeTaskHandler(
  input: ExecuteTaskInput,
  apiOrFactory: OctoparseApi | (() => Promise<OctoparseApi | undefined>) | undefined
) {
  const api = await resolveApiInstance(apiOrFactory);
  if (!api) {
    throw new Error('API instance required');
  }

  const preparation = await prepareExecuteTaskExecution(input, api);
  if (preparation.kind === 'response') {
    return preparation.response;
  }

  const preparedExecution = preparation.preparedExecution;
  const milestones: ExecuteTaskMilestone[] = [];
  let taskId: string;
  try {
    const created = await api.createTemplateTask(
      preparedExecution.templateId,
      preparedExecution.taskName,
      undefined,
      preparedExecution.userInputParameters,
      undefined,
      undefined,
      {
        templateDetail: preparedExecution.templateView,
        templateVersionDetail: preparedExecution.templateVersionDetail
      }
    );
    taskId = created.taskId;
    pushExecuteTaskMilestone(milestones, 'task_created', 'Task created successfully in Octoparse', {
      taskId,
      detail: `templateName=${preparedExecution.templateName}${preparedExecution.parameterKeyMappings.length > 0 ? `; mappedKeys=${preparedExecution.parameterKeyMappings.map((m) => `${m.from}->${m.to}`).join(',')}` : ''}${preparedExecution.ignoredParameterKeys.length > 0 ? `; ignoredKeys=${preparedExecution.ignoredParameterKeys.join(',')}` : ''}`
    });
  } catch (e) {
    return buildWorkflowToolError(
      'task_creation_failed',
      sanitizeTemplateTaskCreationError(
        e instanceof Error ? e.message : 'Task creation failed'
      ),
      {
        recoverable: true,
        operation: 'creating task from template',
        recoverySuggestion:
          'Adjust parameter keys and types based on inputSchema (MultiInput values must be arrays of strings).'
      }
    );
  }

  let startResult;
  try {
    startResult = await api.startTask(taskId);
  } catch (e) {
    if (isTrialTemplateTaskCollectLimitError(e)) {
      return buildWorkflowToolError(
        'plan_upgrade_required',
        getTrialTemplateCollectLimitUpgradeMessage(),
        {
          recoverable: false,
          requiresUserAction: true,
          operation: 'starting cloud task',
          taskId,
          upgradeUrl: getPlanUpgradeUrl(),
          upstreamErrorCode: e.code
        }
      );
    }

    return buildWorkflowToolError(
      'cloud_start_failed',
      getStartTaskErrorMessage(e),
      {
        recoverable: true,
        operation: 'starting cloud task',
        taskId,
        recoverySuggestion:
          'Verify account credits and that the template supports cloud execution.'
      }
    );
  }

  if (startResult.result !== StartTaskResult.SUCCESS) {
    if (
      startResult.result === StartTaskResult.INSUFFICIENT_CREDITS ||
      startResult.result === StartTaskResult.USER_CREDIT_INSUFFICIENT
    ) {
      return buildWorkflowToolError(
        'insufficient_credits',
        startResult.message || 'Insufficient Octoparse credits to start this cloud task.',
        {
          recoverable: false,
          requiresUserAction: true,
          taskId
        }
      );
    }
    if (startResult.result === StartTaskResult.ALREADY_RUNNING) {
      pushExecuteTaskMilestone(
        milestones,
        'cloud_run_started',
        'Cloud task was already running; polling latest status',
        {
          taskId
        }
      );
    } else {
      pushExecuteTaskMilestone(milestones, 'cloud_start_rejected', 'Cloud start did not succeed', {
        taskId,
        detail: getStartTaskResultDescription(startResult.result)
      });
      return {
        success: false,
        taskId,
        templateName: preparedExecution.templateName,
        status: 'failed' as const,
        recoverable: false,
        milestones,
        ...(startResult.lotNo ? { lotNo: startResult.lotNo } : {}),
        message: startResult.message || getStartTaskResultDescription(startResult.result),
        startResultCode: startResult.errorCode ?? EnumLabelUtil.startTaskResult(startResult.result),
        upstreamMessage: startResult.message,
        startResultLabel: EnumLabelUtil.startTaskResult(startResult.result)
      };
    }
  } else {
    pushExecuteTaskMilestone(milestones, 'cloud_run_started', 'Cloud collection started successfully', { taskId });
  }

  if (preparedExecution.targetMaxRows !== undefined) {
    return buildWorkflowToolError(
      'target_max_rows_requires_task_mode',
      'targetMaxRows requires MCP task execution because the server must keep polling in the background to request stopTask at the threshold.',
      {
        recoverable: true,
        requiresUserAction: true,
        taskId,
        targetMaxRows: preparedExecution.targetMaxRows,
        suggestedNextCall: {
          tool: 'execute_task' as const,
          args: {
            templateName: preparedExecution.templateName,
            ...(preparedExecution.taskName ? { taskName: preparedExecution.taskName } : {}),
            parameters: input.parameters,
            targetMaxRows: preparedExecution.targetMaxRows
          },
          reason: 'use_task_mode_for_target_max_rows' as const
        }
      }
    );
  }

  pushExecuteTaskMilestone(
    milestones,
    'handoff_to_export_data',
    'Cloud task accepted; non-task clients should follow up with export_data'
  );
  return {
    success: true,
    taskId,
    templateName: preparedExecution.templateName,
    status: 'accepted' as const,
    milestones,
    ...(startResult.lotNo ? { lotNo: startResult.lotNo } : {}),
    message:
      `Cloud task started. This request is using the direct compatibility fallback instead of the recommended MCP Tasks mode, so wait about ${NON_TASK_EXPORT_POLL_MIN_SECONDS}-${NON_TASK_EXPORT_POLL_MAX_SECONDS} seconds before calling export_data(taskId) to monitor collection and export progress.`,
    retryGuidance: {
      tool: 'export_data' as const,
      waitSecondsMin: NON_TASK_EXPORT_POLL_MIN_SECONDS,
      waitSecondsMax: NON_TASK_EXPORT_POLL_MAX_SECONDS,
      instruction: buildNonTaskExportRetryInstruction(taskId)
    },
    suggestedNextCall: {
      tool: 'export_data' as const,
      args: { taskId },
      reason: 'non_task_followup' as const
    },
    workflow: {
      nextTool: 'export_data' as const,
      followupMode: 'export_data_polling' as const,
      instruction: buildNonTaskExportRetryInstruction(taskId)
    }
  };
}

export function createExecuteTaskTool(
  options: CreateExecuteTaskToolOptions = {}
): ToolDefinition {
  const executionTaskService = options.executionTaskService ?? defaultExecutionTaskService;

  return {
    name: 'execute_task',
    title: messages.tools.executeTask.title,
    description: messages.tools.executeTask.description,
    requiresAuth: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    inputSchema: executeTaskInputSchema,
    handler: executeTaskHandler,
    plainCallExecution: 'direct',
    taskRegistration: {
      execution: {
        taskSupport: 'optional'
      },
      handler: {
        createTask: async (input, apiOrFactory, extra) => {
          const api = await resolveApiInstance(apiOrFactory);
          if (!api) {
            throw new Error('API instance required');
          }

          const preparation = await prepareExecuteTaskExecution(input as ExecuteTaskInput, api);
          if (preparation.kind === 'response') {
            return await createImmediateTaskResult(
              extra.taskStore,
              preparation.response
            );
          }

          return await executionTaskService.createTask({
            preparedExecution: preparation.preparedExecution,
            extra
          });
        },
        getTask: async (input, getApi, extra) =>
          await executionTaskService.getTask(input, getApi, extra),
        getTaskResult: async (input, getApi, extra) =>
          await executionTaskService.getTaskResult(input, getApi, extra)
      }
    }
  };
}

export const executeTaskTool: ToolDefinition = createExecuteTaskTool();

export const allTools: ToolDefinition[] = [searchTemplateTool, executeTaskTool];
