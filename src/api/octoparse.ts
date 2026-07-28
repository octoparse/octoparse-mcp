import { z } from "zod";
import { ClientApiClient, HttpClientFactory } from './clients/http-client-factory.js';
import { AuthManager } from './auth.js';
import { AppConfig } from '../config/app-config.js';
import {
  START_TASK_NO_PERMISSION_MESSAGE,
  getStartTaskMessageByCode
} from '../errors/task-errors.js';
import { Logger } from '../utils/logger.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import {
  StartTaskDto,
  StartTaskErrorCode,
  StartTaskResult,
  GetTaskStatusByIdListV2Dto,
  GetTaskStatusDto,
  GetTaskStatusDtoSchema,
  TaskGroupDto,
  TaskGroupIdsDto,
  ApiResult,
  GetBatchTaskRequest,
  BatchTaskResponse,
  QueryByPhraseTemplateRequest,
  QueryByPhraseTemplateResponse,
  TemplateView,
  TemplateVersionDetail,
  TaskInfoDto,
  TemplateKind,
  SearchTaskListRequest,
  SearchTaskListResponse,
  AsyncExportDataSourceType,
  AsyncExportFileType,
  AsyncExportPreviewData,
  BasicUserInfoModel,
  TaskInfoDtoSchema,
  TemplateViewSchema,
  SearchTaskListResponseSchema,
  TaskGroupDtoSchema,
  BasicUserInfoModelSchema,
  QueryByPhraseTemplateResponseSchema,
  AsyncExportPreviewDataSchema,
  BatchTaskResponseSchema,
  ApiData,
  OctoparseApiError,
  CouponRedeemResult,
  CouponRedeemResultSchema
} from './types.js';
import {
  ensureUIParametersDefaults,
  validateTemplateParameters,
  validateUserInputParameters
} from '../tools/template-parameter-validation.js';

const octoparseLog = Logger.createNamedLogger('octoparse.api.client');

/** Best-effort parse of extracted row count from GET /api/progress/task/{id}/summary (field names vary by API version). */
function parseProgressSummaryExtractCount(data: Record<string, unknown>): number | null {
  const raw =
    data.extCnt ??
    data.dataCnt ??
    data.extractCount ??
    data.totalExtractCount;
  if (raw === undefined || raw === null) {
    return null;
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.floor(n);
}

function normalizeStartTaskMessage(message: string, errorCode?: StartTaskErrorCode): string {
  const trimmed = message.trim();
  if (
    errorCode === StartTaskErrorCode.FUNCTION_NOT_ENABLE ||
    getStartTaskMessageByCode(trimmed)
  ) {
    return START_TASK_NO_PERMISSION_MESSAGE;
  }
  return trimmed.length > 0 ? trimmed : 'Unknown error';
}

function pickStartTaskMessage(response: any): string | undefined {
  const candidates = [
    response?.message,
    response?.msg,
    response?.error_Description,
    response?.error_description,
    response?.data?.message
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function extractStartTaskRawCode(response: any): number | undefined {
  const directCode = response?.data;
  if (typeof directCode === 'number' && Number.isFinite(directCode)) {
    return directCode;
  }

  if (typeof directCode === 'string' && directCode.trim() !== '') {
    const parsed = Number(directCode);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const objectCode = response?.data?.result ?? response?.data?.code;
  if (typeof objectCode === 'number' && Number.isFinite(objectCode)) {
    return objectCode;
  }

  return undefined;
}

function createBusinessApiError(
  response: {
    error?: string;
    error_Description?: string;
    error_description?: string;
  },
  statusCode?: number
): OctoparseApiError {
  return new OctoparseApiError(
    response.error,
    response.error_Description || response.error_description || response.error,
    statusCode
  );
}

export class OctoparseApi {
  private httpClient: ClientApiClient;

  constructor(authManager: AuthManager) {
    this.httpClient = HttpClientFactory.getClientApiClient(authManager);
  }

  public async getUserId(): Promise<string | null> {
    return this.httpClient.getUserId();
  }

  public async isAuthenticated(): Promise<boolean> {
    return this.httpClient.isAuthenticated();
  }

  /**
   * Helper to unwrap generic ApiResult response and optionally validate with Zod
   * @param promise Promise returning ApiResult<T> 
   * @param schema Optional Zod schema to validate and strip extra fields
   */
  private async unwrapApiResult<T>(promise: Promise<ApiResult<T>>, schema?: z.ZodType<T>): Promise<T> {
    const result = await promise;
    if (result.error && result.error !== 'success') {
      throw createBusinessApiError(result);
    }

    const data = result.data as T;
    if (schema && data) {
      return schema.parse(data);
    }
    return data;
  }

  // Start a task
  public async startTask(taskId: string): Promise<StartTaskDto> {
    const response = await this.httpClient.post<any>(`/api/task/startTask?taskId=${taskId}`);

    // If there is an error (and it's not "success"), throw it
    if (response.error && response.error !== 'success') {
      if (getStartTaskMessageByCode(response.error)) {
        return {
          result: StartTaskResult.USER_INSUFFICIENT_PERMISSION,
          errorCode: StartTaskErrorCode.FUNCTION_NOT_ENABLE,
          message: START_TASK_NO_PERMISSION_MESSAGE
        };
      }

      throw new OctoparseApiError(
        response.error,
        response.error_Description || response.error_description || response.error,
        400
      );
    }

    const rawCode = extractStartTaskRawCode(response);
    if (rawCode === undefined) {
      throw new OctoparseApiError('UNKNOWN_START_TASK_RESPONSE', 'Unknown response from startTask API', 400);
    }

    const upstreamMessage = pickStartTaskMessage(response);
    const errorCode = EnumLabelUtil.mapStartTaskApiCodeToErrorCode(rawCode, upstreamMessage);
    const message = normalizeStartTaskMessage(
      upstreamMessage ?? EnumLabelUtil.startTaskErrorMessage(errorCode),
      errorCode
    );

    return {
      result: EnumLabelUtil.mapStartTaskErrorCodeToResult(errorCode),
      errorCode,
      message,
      lotNo: typeof response?.data?.lotNo === 'string' ? response.data.lotNo : undefined
    };

  }

  // Stop a task
  public async stopTask(taskId: string): Promise<void> {
    // Get user account info to check permissions
    try {
      const accountInfo = await this.getAccountInfo();
      const allowedUserLevels = [2, 3, 31, 4, 120, 130, 140];

      // Check if user level is not in allowed levels for cloud collection
      if (!allowedUserLevels.includes(accountInfo.currentAccountLevel ?? 0)) {
        throw new Error('Your account level does not have permission to stop cloud collection tasks. Please upgrade your account to control cloud collection tasks.');
      }
    } catch (error) {
      octoparseLog.warn('Could not fetch user account information for permission check', {
        meta: {
          taskId,
          errorMessage: error instanceof Error ? error.message : 'unknown_error'
        }
      });
      // Continue with stop if we can't fetch account info
    }

    // New ClientAPI endpoint: POST /api/task/stopTask?taskId={taskId}
    // Response: {"data":1,"error":"success"}
    const response = await this.httpClient.post<any>(`/api/task/stopTask?taskId=${taskId}`);

    // Handle the specific response format where error is "success"
    if (response.error === 'success' || (!response.error && response.data === 1)) {
      return;
    }

    // If there is an error (and it's not "success"), throw it
    if (response.error && response.error !== 'success') {
      throw createBusinessApiError(response);
    }

    // Fallback for unexpected response structure
    if (response.data === 1) {
      return;
    }

    throw new Error('Unknown response from stopTask API');
  }

  // Get task status (batch summary using ClientAPI for more detailed information)
  public async getTaskStatus(taskIds: string[]): Promise<GetTaskStatusByIdListV2Dto[]> {
    if (!taskIds || taskIds.length === 0) {
      throw new Error('taskIds array cannot be empty');
    }

    // New ClientAPI endpoint: GET /api/progress/task/{taskId}/summary
    // We need to fetch status for each task individually
    const promises = taskIds.map(async (taskId) => {
      try {
        const response = await this.httpClient.get<any>(`/api/progress/task/${taskId}/summary`);
        const data = response?.data;

        // Handle response format: {"data": {...}, "error": "success"}
        // Some upstream responses may return error=success but data=null/undefined.
        if (response?.error === 'success' || (!response?.error && data)) {
          if (!data || typeof data !== 'object') {
            // Not a hard error; caller will keep polling.
            octoparseLog.warn('Task status summary is empty; skipping this poll tick', {
              meta: {
                taskId
              }
            });
            return null;
          }
          const summary = data as Record<string, unknown>;

          // Map to GetTaskStatusByIdListV2Dto
          return {
            taskId: typeof summary.tId === 'string' ? summary.tId : taskId,
            status: this.mapStatus(typeof summary.status === 'number' ? summary.status : undefined),
            currentTotalExtractCount: parseProgressSummaryExtractCount(
              summary
            ),
            exported: summary.exported === true,
            executedTimes: 0, // Not available in new API summary
            subTaskCount: typeof summary.steps === 'number' ? summary.steps : undefined,
            nextExecuteTime: undefined, // Not available
            endExecuteTime: undefined, // Not available
            executingTime: typeof summary.spendSec === 'number' ? `${summary.spendSec}s` : undefined,
            startExecuteTime: typeof summary.startTime === 'string' ? summary.startTime : undefined,
            startExecuteTimeSeconds: undefined // Not available
          } as GetTaskStatusByIdListV2Dto;
        }
        return null;
      } catch (error) {
        octoparseLog.error('Failed to get status for task', {
          error: error instanceof Error ? error : undefined,
          meta: {
            taskId,
            errorMessage: error instanceof Error ? error.message : 'unknown_error'
          }
        });
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((item): item is GetTaskStatusByIdListV2Dto => item !== null);
  }

  // Get task status (single task) - unwraps ClientAPI result
  public async getTaskStatusById(taskId: string): Promise<GetTaskStatusDto> {
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<GetTaskStatusDto>>(`/api/progress/task/${taskId}/summary`),
      GetTaskStatusDtoSchema
    );
  }

  private mapStatus(status?: number): string {
    // Map numeric status to string description based on DispatchTaskStatus enum
    // Unexecuted = 0, Waiting = 1, Executing = 2, Stopping = 3, Stopped = 4, Finished = 5
    switch (status) {
      case 0: return 'Unexecuted';
      case 1: return 'Waiting';
      case 2: return 'Executing';
      case 3: return 'Stopping';
      case 4: return 'Stopped';
      case 5: return 'Finished';
      default: return `Status(${status})`;
    }
  }

  // Get all task groups
  public async getTaskGroups(): Promise<TaskGroupDto[]> {
    // Updated endpoint to use ClientAPI format
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<TaskGroupDto[]>>('/api/taskGroup/getTaskGroupList'),
      z.array(TaskGroupDtoSchema)
    );
  }

  // Get default task group ID
  public async getDefaultTaskGroup(): Promise<number> {
    // New ClientAPI endpoint: GET api/taskGroup/default
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<number>>('/api/taskGroup/default')
    );
  }

  // Get all task IDs by group
  public async getTaskIdsByGroup(): Promise<TaskGroupIdsDto[]> {
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<TaskGroupIdsDto[]>>('/api/task/getTaskIdsByGroup')
    );
  }

  /**
   * Search task list with pagination and filters (ClientAPI: searchTaskListV3)
   */
  public async searchTaskList(request: SearchTaskListRequest): Promise<SearchTaskListResponse> {
    const params: Record<string, any> = {
      pageIndex: request.pageIndex ?? 1,
      pageSize: request.pageSize ?? 20,
      taskGroup: request.taskGroup ?? '',
      keyWord: request.keyWord ?? '',
      status: request.status ?? '',
      orderBy: request.orderBy ?? '',
      taskType: request.taskType ?? '',
      isScheduled: request.isScheduled ?? '',
      userId: request.userId ?? '',
      extractCountRange: request.extractCountRange ?? '',
      endExecuteTimeRange: request.endExecuteTimeRange ?? '',
      startExecuteTimeRange: request.startExecuteTimeRange ?? ''
    };

    if (request.taskIds && request.taskIds.length > 0) {
      params.taskIds = request.taskIds.join(',');
    }

    // Use ClientAPI endpoint (same domain as other ClientAPI calls)
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<SearchTaskListResponse>>(
        '/api/task/searchTaskListV3',
        params
      ),
      SearchTaskListResponseSchema
    );
  }

  // Batch get task information
  public async getBatchTask(taskIds: string[]): Promise<BatchTaskResponse> {
    if (!taskIds || taskIds.length === 0) {
      throw new Error('taskIds array cannot be empty');
    }

    const request: GetBatchTaskRequest = { taskIds };
    return await this.unwrapApiResult(
      this.httpClient.post<ApiResult<BatchTaskResponse>>('/api/task/batch/getTask', request),
      BatchTaskResponseSchema
    );
  }

  public async createAsyncCloudStorageExport(
    taskId: string,
    targetFileType: AsyncExportFileType = AsyncExportFileType.JSON,
    dataSourceType: AsyncExportDataSourceType = AsyncExportDataSourceType.TaskData
  ): Promise<void> {
    const result = await this.httpClient.post<ApiResult<void>>(
      '/api/asynchronousExport/asynchronousExport/ExportData/cloudStorage',
      {
        taskId,
        dataSourceType,
        targetFileType
      }
    );

    if (result.error && result.error !== 'success') {
      throw new OctoparseApiError(
        result.error,
        result.error_description || result.error,
        400
      );
    }
  }

  public async getLastExportPreview(
    taskId: string,
    sampleSize: number = 10
  ): Promise<AsyncExportPreviewData> {
    const normalizedSampleSize = Math.min(Math.max(sampleSize, 1), 20);

    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<AsyncExportPreviewData>>(
        `/api/asynchronousExport/asynchronousExport/ExportData/lastExportPreview/${taskId}`,
        { sampleSize: normalizedSampleSize }
      ),
      AsyncExportPreviewDataSchema
    );
  }

  /**
   * Get template details.
   * New API endpoint: GET api/templateService/templates/{id}/view
   * @param id The template ID.
   */
  public async getTemplateView(id: number | string): Promise<TemplateView> {
    const template = await this.unwrapApiResult(
      this.httpClient.get<ApiResult<TemplateView>>(
        `/api/templateService/templates/${id}/view`,
        undefined,
        { 'Accept-Language': AppConfig.getHttpConfig().acceptLanguage }
      ),
      TemplateViewSchema
    );
    return this.processTemplateView(template);
  }

  /**
   * Get template details by slug.
   * New API endpoint: GET /api/templateService/templates/slugs/{slug}/view
   * @param slug The template slug.
   */
  public async getTemplateBySlug(slug: string): Promise<TemplateView> {
    const template = await this.unwrapApiResult(
      this.httpClient.get<ApiResult<TemplateView>>(
        `/api/templateService/templates/slug/${slug}/view`,
        undefined,
        { 'Accept-Language': AppConfig.getHttpConfig().acceptLanguage }
      ),
      TemplateViewSchema
    );
    return this.processTemplateView(template);
  }

  /**
   * Process template view to hide Remark field while preserving its information in description
   * @param template The template view to process
   */
  private processTemplateView(template: TemplateView): TemplateView {
    if (!template || !template.parameters) {
      return template;
    }

    try {
      const params = JSON.parse(template.parameters);
      if (Array.isArray(params)) {
        const processedParams = params.map((param: any) => {
          // If Remark has value, prepend it to DisplayText to ensure LLM sees it as guidance
          if (param.Remark && param.Remark.trim()) {
            const remark = param.Remark.trim();
            // Create a rich description for the LLM
            param.DisplayText = param.DisplayText
              ? `${param.DisplayText} (Instruction: ${remark})`
              : `Instruction: ${remark}`;
          }

          // Hide Remark field from the final output
          const { Remark, ...rest } = param;
          return rest;
        });

        template.parameters = JSON.stringify(processedParams);
      }
    } catch (error) {
      octoparseLog.warn('Failed to process template parameters for Remark hiding', {
        meta: {
          templateId: template.id,
          errorMessage: error instanceof Error ? error.message : 'unknown_error'
        }
      });
    }

    return template;
  }

  /**
   * Get template current version details.
   * New API endpoint: GET /api/templateService/templates/{id}/versions:current
   * @param id The template ID.
   */
  public async getTemplateCurrentVersion(id: number | string): Promise<TemplateVersionDetail> {
    return this.unwrapApiResult(
      this.httpClient.get<ApiResult<TemplateVersionDetail>>(
        `/api/templateService/templates/${id}/versions:current`,
        undefined,
        { 'Accept-Language': AppConfig.getHttpConfig().acceptLanguage }
      )
    );
  }

  /**
   * Batch get current template version details.
   * New API endpoint: GET /api/templateservice/templates/versions:current?templateIds=1,2,3
   * @param templateIds Template IDs joined by comma in query string.
   */
  public async getTemplateCurrentVersions(templateIds: Array<number | string>): Promise<TemplateVersionDetail[]> {
    const normalizedIds = Array.from(
      new Set(
        templateIds
          .map((id) => typeof id === 'number' ? id : Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (normalizedIds.length === 0) {
      return [];
    }

    return this.unwrapApiResult(
      this.httpClient.get<ApiResult<TemplateVersionDetail[]>>(
        '/api/templateservice/templates/versions:current',
        { templateIds: normalizedIds.join(',') },
        { 'Accept-Language': AppConfig.getHttpConfig().acceptLanguage }
      )
    );
  }

  /**
   * Search templates using elastic search.
   * New API endpoint: GET /v1/templateservice/templates/elasticSearch?queryPhrase={keyword}
   * @param request The search request containing the keyword.
   */
  public async searchTemplates(request: QueryByPhraseTemplateRequest): Promise<QueryByPhraseTemplateResponse> {
    const params: Record<string, any> = {};

    // Add queryPhrase parameter if keyword is provided
    if (request.keyword) {
      params.queryPhrase = request.keyword;
    }

    if (request.limit !== undefined) {
      params.limit = request.limit;
    }

    if (request.runOns) {
      params.runOns = request.runOns;
    }

    if (request.isPublished !== undefined) {
      params.isPublished = request.isPublished;
    }

    // Use webApiGet for WebAPI endpoint and return the response directly
    const response = await this.httpClient.get<QueryByPhraseTemplateResponse>(
      '/api/templateservice/templates/queryByPhrase',
      params
    );

    // Manual validation since it doesn't use unwrapApiResult
    return QueryByPhraseTemplateResponseSchema.parse(response);
  }

  // Get account information from ClientAPI
  public async getAccountInfo(): Promise<BasicUserInfoModel> {
    const result = await this.httpClient.get<ApiResult<ApiData<BasicUserInfoModel>>>('/api/user/basic');
    if (result.error && result.error !== 'success') {
      throw createBusinessApiError(result);
    }

    // Extract the actual user data from ApiData structure: { data?: BasicUserInfoModel }
    const userData = result.data;
    if (userData) {
      return BasicUserInfoModelSchema.parse(userData);
    }
    return {} as BasicUserInfoModel;
  }

  public async redeemCouponCode(code: string): Promise<CouponRedeemResult> {
    const response = await this.httpClient.post<ApiResult<CouponRedeemResult> | CouponRedeemResult>(
      '/api/saleservice/coupon/redeem-by-code',
      { code }
    );

    const normalizePayload = (payload: unknown): unknown => {
      if (typeof payload !== 'string') {
        return payload;
      }

      const trimmed = payload.trim();
      if (!trimmed) {
        return payload;
      }

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return payload;
        }
      }

      return payload;
    };

    const normalizedResponse = normalizePayload(response);

    if (normalizedResponse && typeof normalizedResponse === 'object') {
      const wrapped = normalizedResponse as Partial<ApiResult<CouponRedeemResult>>;
      if (wrapped.error && wrapped.error !== 'success') {
        throw new OctoparseApiError(
          wrapped.error,
          wrapped.error_description || wrapped.error,
          400
        );
      }

      if (wrapped.data) {
        return CouponRedeemResultSchema.parse(normalizePayload(wrapped.data));
      }

      const directError = normalizedResponse as { code?: unknown; message?: unknown; isSuccess?: unknown };
      if (!('isSuccess' in directError) && typeof directError.code === 'string') {
        throw new OctoparseApiError(
          directError.code,
          typeof directError.message === 'string' ? directError.message : directError.code,
          400
        );
      }
    }

    if (typeof normalizedResponse === 'string') {
      throw new OctoparseApiError(normalizedResponse, normalizedResponse, 400);
    }

    return CouponRedeemResultSchema.parse(normalizedResponse);
  }

  // Get template kinds from ClientAPI
  public async getTemplateKinds(): Promise<TemplateKind[]> {
    // Using ClientAPI instead of WebAPI to fetch template kinds
    const response = await this.httpClient.get<ApiResult<TemplateKind[]>>('/api/templateService/kinds/contents',
      undefined,
      { 'Accept-Language': AppConfig.getHttpConfig().acceptLanguage }
    );

    // Handle ClientAPI response structure
    if (response && Array.isArray(response.data)) {
      // Sort by sort field (descending, as higher sort values appear first in the API response)
      // Type assertion is safe here as the API returns the correct structure
      return response.data.sort((a, b) => (b.sort || 0) - (a.sort || 0)) as TemplateKind[];
    }

    return [];
  }

  /**
   * Create a new template task
   * @param templateId The template ID
   * @param taskName The name for the new task (optional, will be auto-generated if not provided)
   * @param taskGroupId The target task group ID (optional, will use default if not provided)
   * @param userInputParameters The user input parameters for the template
   * @param urlSourceTaskId Source task ID for URL source (optional)
   * @param urlSourceTaskField Source field name for URL source (optional)
   * @returns The created task ID
   */
  public async createTemplateTask(
    templateId: number,
    taskName?: string,
    taskGroupId?: number,
    userInputParameters?: {
      UIParameters: Array<{ Id: string; Value?: any; Customize?: any; sourceTaskId?: string; sourceField?: string }>;
      TemplateParameters: Array<{ ParamName: string; Value?: any }>;
    },
    urlSourceTaskId?: string,
    urlSourceTaskField?: string,
    options?: {
      templateDetail?: TemplateView;
      templateVersionDetail?: TemplateVersionDetail;
      defaultTaskGroupId?: number;
    }
  ): Promise<{ taskId: string }> {
    // Use default task group if not provided
    const actualTaskGroupId =
      taskGroupId || options?.defaultTaskGroupId || await this.getDefaultTaskGroup();

    // Generate task name if not provided
    const actualTaskName = taskName || `template_${templateId}_mcp_${this.generateTimestamp()}`;

    // Get template details to fill in version information
    const templateDetail = options?.templateDetail || await this.getTemplateView(templateId);
    const templateVersionDetail =
      options?.templateVersionDetail || await this.getTemplateCurrentVersion(templateId);

    // CRITICAL: Ensure all UIParameters have required default fields before validation
    // This prevents task execution failures due to missing Customize, sourceTaskId, or sourceField
    const normalizedParams = ensureUIParametersDefaults(userInputParameters);

    // Validate userInputParameters structure
    validateUserInputParameters(normalizedParams);

    // Validate against actual template parameter requirements
    if (templateVersionDetail.parameters) {
      validateTemplateParameters(normalizedParams, templateVersionDetail.parameters);
    }

    // Create the request body
    const requestBody = {
      taskName: actualTaskName,
      taskGroupId: actualTaskGroupId,
      templateId: templateVersionDetail.id,
      templateType: templateDetail.currentVersion?.type ?? 1, // Default to 1 if not available
      templateVersion: templateVersionDetail.version,
      templateRegistrationId: templateId, // Using templateId as templateRegistrationId
      userInputParameters: JSON.stringify(normalizedParams), // Use normalized parameters with required defaults
      templateVersionId: templateVersionDetail.id,
      urlSourceTaskId: urlSourceTaskId || '',
      urlSourceTaskField: urlSourceTaskField || ''
    };

    try {
      // Make the API call to create the template task
      const response = await this.httpClient.post<any>('/api/tasks/templateMapping', requestBody);

      if (response.error && response.error !== 'success') {
        throw createBusinessApiError(response);
      }

      if (response.data && response.data.taskId) {
        return { taskId: response.data.taskId };
      } else {
        throw new Error('Invalid response from template task creation API');
      }
    } catch (error) {
      Logger.logError('Error creating template task', error as Error, {
        meta: {
          templateId,
          taskName: actualTaskName
        }
      });
      throw error;
    }
  }

  private generateTimestamp(): string {
    const now = new Date();
    return now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
  }

  /**
   * Get template mapping information for a specific task
   * New API endpoint: GET /api/tasks/{taskId}/templateMapping
   * @param taskId The task ID to get template mapping for
   */
  public async getTaskTemplateMapping(taskId: string): Promise<{
    taskId: string;
    templateId: number;
    userInputParameters: string; // JSON string
    templateVersion: number;
    templateVersionId: number;
    urlSourceTaskId: string;
    urlSourceTaskField: string;
  }> {
    const response = await this.httpClient.get<any>(`/api/tasks/${taskId}/templateMapping`);

    // Check for API error
    if (response.error && response.error !== 'success') {
      throw createBusinessApiError(response);
    }

    // Return the template mapping data
    return response.data;
  }

  /**
   * Get task information by task ID
   * New API endpoint: GET /api/taskruleService/task/GetTaskInfoById?taskId={taskId}
   * @param taskId The task ID to get information for
   */
  public async getTaskInfoById(taskId: string): Promise<TaskInfoDto> {
    return await this.unwrapApiResult(
      this.httpClient.get<ApiResult<TaskInfoDto>>(`/api/taskruleService/task/GetTaskInfoById?taskId=${taskId}`),
      TaskInfoDtoSchema
    );
  }

  /**
   * Merge new parameters with existing parameters
   * This method merges new parameters with existing ones instead of replacing them
   * @param existingParams The existing parameters from the task
   * @param newParams The new parameters to merge
   * @returns Merged parameters
   */
  private mergeUserInputParameters(
    existingParams: {
      UIParameters: Array<{ Id: string; Value?: any; Customize?: any; sourceTaskId?: string; sourceField?: string }>;
      TemplateParameters: Array<{ ParamName: string; Value?: any }>;
    },
    newParams: {
      UIParameters: Array<{ Id: string; Value?: any; Customize?: any; sourceTaskId?: string; sourceField?: string }>;
      TemplateParameters: Array<{ ParamName: string; Value?: any }>;
    }
  ): {
    UIParameters: Array<{ Id: string; Value?: any; Customize?: any; sourceTaskId?: string; sourceField?: string }>;
    TemplateParameters: Array<{ ParamName: string; Value?: any }>;
  } {
    // Clone existing parameters to avoid mutation
    const mergedUIParams = [...existingParams.UIParameters];
    const mergedTemplateParams = [...existingParams.TemplateParameters];

    // Process new UI parameters
    for (const newUIParam of newParams.UIParameters) {
      // Find existing UI parameter with the same Id
      const existingUIParamIndex = mergedUIParams.findIndex(param => param.Id === newUIParam.Id);

      if (existingUIParamIndex !== -1) {
        // If parameter exists, merge the values
        if (Array.isArray(mergedUIParams[existingUIParamIndex].Value) && Array.isArray(newUIParam.Value)) {
          // If both are arrays, merge them
          const existingValueSet = new Set(mergedUIParams[existingUIParamIndex].Value);
          const mergedValue = [
            ...mergedUIParams[existingUIParamIndex].Value,
            ...newUIParam.Value.filter(v => !existingValueSet.has(v))
          ];
          mergedUIParams[existingUIParamIndex].Value = mergedValue;
        } else {
          // If not arrays, simply replace with new value
          mergedUIParams[existingUIParamIndex].Value = newUIParam.Value;
        }

        // Update other properties
        mergedUIParams[existingUIParamIndex].Customize = newUIParam.Customize || mergedUIParams[existingUIParamIndex].Customize;
        mergedUIParams[existingUIParamIndex].sourceTaskId = newUIParam.sourceTaskId || mergedUIParams[existingUIParamIndex].sourceTaskId;
        mergedUIParams[existingUIParamIndex].sourceField = newUIParam.sourceField || mergedUIParams[existingUIParamIndex].sourceField;
      } else {
        // If parameter doesn't exist, add it
        mergedUIParams.push({ ...newUIParam });
      }
    }

    // Process new Template parameters
    for (const newTemplateParam of newParams.TemplateParameters) {
      // Find existing template parameter with the same ParamName
      const existingTemplateParamIndex = mergedTemplateParams.findIndex(param => param.ParamName === newTemplateParam.ParamName);

      if (existingTemplateParamIndex !== -1) {
        // If parameter exists, merge the values
        if (Array.isArray(mergedTemplateParams[existingTemplateParamIndex].Value) && Array.isArray(newTemplateParam.Value)) {
          // If both are arrays, merge them
          const existingValueSet = new Set(mergedTemplateParams[existingTemplateParamIndex].Value);
          const mergedValue = [
            ...mergedTemplateParams[existingTemplateParamIndex].Value,
            ...newTemplateParam.Value.filter(v => !existingValueSet.has(v))
          ];
          mergedTemplateParams[existingTemplateParamIndex].Value = mergedValue;
        } else {
          // If not arrays, simply replace with new value
          mergedTemplateParams[existingTemplateParamIndex].Value = newTemplateParam.Value;
        }
      } else {
        // If parameter doesn't exist, add it
        mergedTemplateParams.push({ ...newTemplateParam });
      }
    }

    return {
      UIParameters: mergedUIParams,
      TemplateParameters: mergedTemplateParams
    };
  }

  /**
   * Update a template task with merged parameters
   * @param taskId The task ID to update
   * @param taskName The new name for the task
   * @param taskGroupId The target task group ID
   * @param templateId The template ID
   * @param templateType The template type (optional, defaults to 1)
   * @param templateVersion The template version
   * @param templateRegistrationId The template registration ID
   * @param userInputParameters The new user input parameters to merge with existing ones
   * @param templateVersionId The template version ID
   * @param urlSourceTaskId Source task ID for URL source (optional)
   * @param urlSourceTaskField Source field name for URL source (optional)
   * @param mergeParams Whether to merge the parameters with existing ones (default: true). If false, parameters will be replaced.
   * @returns Boolean indicating success
   */
  public async updateTemplateTask(
    taskId: string,
    taskName: string,
    taskGroupId: string | number,
    templateId: number,
    templateType: number = 1,
    templateVersion: number,
    templateRegistrationId: number,
    userInputParameters: {
      UIParameters: Array<{
        Id: string;
        Value?: any;
        Customize?: any;
        sourceTaskId?: string;
        sourceField?: string
      }>;
      TemplateParameters: Array<{ ParamName: string; Value?: any }>;
    },
    templateVersionId: number,
    urlSourceTaskId?: string,
    urlSourceTaskField?: string,
    mergeParams: boolean = true
  ): Promise<boolean> {
    // First, get the template to check required parameters
    const templateVersionDetail = await this.getTemplateCurrentVersion(templateId);

    // CRITICAL: Ensure all UIParameters have required default fields before validation
    // This prevents task execution failures due to missing Customize, sourceTaskId, or sourceField
    const normalizedParams = ensureUIParametersDefaults(userInputParameters);

    // Validate userInputParameters structure - each must have required fields
    validateUserInputParameters(normalizedParams);

    // Validate against actual template parameter requirements
    if (templateVersionDetail.parameters) {
      validateTemplateParameters(normalizedParams, templateVersionDetail.parameters);
    }

    let finalUserInputParameters = normalizedParams;

    if (mergeParams) {
      // Get existing template mapping to merge parameters
      try {
        const existingMapping = await this.getTaskTemplateMapping(taskId);

        // Parse the existing userInputParameters from the stored JSON string
        const existingUserInputParams = JSON.parse(existingMapping.userInputParameters);

        // Merge the parameters
        const mergedParams = this.mergeUserInputParameters(
          existingUserInputParams,
          normalizedParams
        );

        // CRITICAL: Ensure merged parameters also have required default fields
        // Existing task parameters might be missing these fields too
        finalUserInputParameters = ensureUIParametersDefaults(mergedParams);
      } catch (error) {
        octoparseLog.warn('Could not fetch existing parameters to merge; using new parameters only', {
          meta: {
            taskId,
            errorMessage: error instanceof Error ? error.message : 'unknown_error'
          }
        });
        // If there's an error fetching existing parameters, proceed with normalized parameters only
        finalUserInputParameters = normalizedParams;
      }
    }

    // Create the request body
    const requestBody = {
      taskId,
      taskName,
      taskGroupId: Number(taskGroupId),
      templateId,
      templateType,
      templateVersion,
      templateRegistrationId,
      userInputParameters: JSON.stringify(finalUserInputParameters),
      templateVersionId,
      urlSourceTaskId: urlSourceTaskId || '',
      urlSourceTaskField: urlSourceTaskField || ''
    };

    try {
      // Make the API call to update the template task
      const response = await this.httpClient.post<any>(`/api/tasks/${taskId}/templateMapping`, requestBody);

      if (response.error && response.error !== 'success') {
        throw createBusinessApiError(response);
      }

      // Return true if the response data is true, otherwise false
      return response.data === true;
    } catch (error) {
      octoparseLog.error('Error updating template task', {
        error: error instanceof Error ? error : undefined,
        meta: {
          taskId,
          errorMessage: error instanceof Error ? error.message : 'unknown_error'
        }
      });
      throw error;
    }
  }
}
