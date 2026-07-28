import { z } from "zod";

// Common types
export const ResultModelSchema = z.object({
  error: z.string().optional(),
  error_Description: z.string().optional(),
});
export type ResultModel = z.infer<typeof ResultModelSchema>;

export interface ResultModelWithData<T> extends ResultModel {
  data?: T;
}

// Generic API Result wrapper for ClientAPI
export interface ApiResult<T> {
  data?: T;
  error?: string;
  error_description?: string;
}

export interface ApiData<T> {
  data?: T;
}

// Authentication types
export interface GetTokenRequest {
  username?: string;
  password?: string;
  refresh_token?: string;
  grant_type?: string;
}

export const TokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.string().optional(),
  token_type: z.string().optional(),
  refresh_token: z.string().optional(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export interface JwtPayload {
  sub?: string;
  userId?: string;
  username?: string;
  iss?: string;
  scope?: string | string[];
  rule?: any;
  exp?: number;
  iat?: number;
  [key: string]: any;
}

// API error types
export class OctoparseApiError extends Error {
  constructor(
    public code?: string,
    public description?: string,
    public statusCode?: number
  ) {
    super(description || code || 'Unknown API error');
    this.name = 'OctoparseApiError';
  }
}

// Task search types
export const BriefTaskInfoDtoSchema = z.object({
  taskId: z.string().optional(),
  taskName: z.string().optional(),
  creationUserId: z.string().optional(),
});
export type BriefTaskInfoDto = z.infer<typeof BriefTaskInfoDtoSchema>;

// Task execute status enum
export enum TaskExecuteStatus {
  All = -1,
  Unexecuted = 0,
  Waiting = 1,
  Executing = 2,
  Stopping = 3,
  Stopped = 4,
  Finished = 5
}

export enum TaskRuleExecuteStatus {
  Running = 0,
  Stopped = 1,
  Completed = 2,
  Waiting = 3,
  Ready = 5
}

// Task type enum
export enum TaskType {
  Xoml = 1,
  NodeJs = 7,
  Python = 8
}

export enum TaskExtractMethod {
  KernelBrowser = 0,
  Headless = 1,
  Visible = 2
}

export const TaskInfoDtoSchema = z.object({
  taskGroupId: z.any().optional(),
  taskId: z.string().optional(),
  taskName: z.string().optional(),
  // taskContentType: z.nativeEnum(TaskContentType).optional(),
  adBlockEnable: z.boolean().optional(),
  capacity: z.number().optional(),
  author: z.string().nullable().optional(),
  taskDescription: z.string().nullable().optional(),
  disableImage: z.boolean().nullable().optional(),
  // disableMapReduce: z.boolean().nullable().optional(),
  // localMapReduce: z.boolean().nullable().optional(),
  optimizationType: z.number().nullable().optional(),
  taskExecuteStatus: z.nativeEnum(TaskRuleExecuteStatus).optional(),
  supplementEnable: z.boolean().nullable().optional(),
  useMobileAgent: z.boolean().nullable().optional(),
  creationUserId: z.string().nullable().optional(),
  creationUserName: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  // taskCategory: z.nativeEnum(TaskCategory).nullable().optional(),
  userAgent: z.string().nullable().optional(),
  configDownload: z.boolean().nullable().optional(),
  templateRegistrationId: z.number().nullable().optional(),
  templateVersionId: z.number().nullable().optional(),
  useKernelBrowser: z.boolean().nullable().optional(),
  extractMethod: z.nativeEnum(TaskExtractMethod).nullable().optional(),
});
export type TaskInfoDto = z.infer<typeof TaskInfoDtoSchema>;

// Task search (searchTaskListV3)
export interface SearchTaskListRequest {
  pageIndex: number;
  pageSize: number;
  taskGroup?: string;
  keyWord?: string;
  status?: string;
  orderBy?: string;
  taskIds?: string[];
  taskType?: string;
  isScheduled?: string;
  userId?: string;
  extractCountRange?: string;
  endExecuteTimeRange?: string;
  startExecuteTimeRange?: string;
}

export const SearchTaskListResponseSchema = z.object({
  total: z.number().optional(),
  pageIndex: z.number().optional(),
  pageSize: z.number().optional(),
  currentTotal: z.number().optional(),
  dataList: z.array(TaskInfoDtoSchema).optional(),
});
export type SearchTaskListResponse = z.infer<typeof SearchTaskListResponseSchema>;


// Start task types
export enum StartTaskResult {
  SUCCESS = 0,
  ALREADY_RUNNING = 1,
  TASK_NOT_FOUND = 2,
  INSUFFICIENT_CREDITS = 4,
  TASK_DISABLED = 5,
  RATE_LIMIT_EXCEEDED = 6,
  UNKNOWN_ERROR = 7,
  USER_NOT_FOUND = 1000,
  USER_SUSPENDED = 1001,
  USER_EXPIRED = 1002,
  USER_INSUFFICIENT_PERMISSION = 1003,
  USER_CREDIT_INSUFFICIENT = 1004
}

/**
 * Normalized startTask error code for MCP/tool responses.
 * Values are string enums to avoid exposing raw upstream numeric codes.
 */
export enum StartTaskErrorCode {
  NONE = 'NONE',
  ON_EXECUTING = 'ON_EXECUTING',
  FUNCTION_NOT_ENABLE = 'FUNCTION_NOT_ENABLE',
  USER_NOT_TASK_OWNER = 'USER_NOT_TASK_OWNER',
  SERVICE_ERROR = 'SERVICE_ERROR',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  FAILED_FOR_OTHER = 'FAILED_FOR_OTHER',
  REACH_TEMPLATE_DAILY_EXTRACT_LIMIT = 'REACH_TEMPLATE_DAILY_EXTRACT_LIMIT',
  REACH_TEMPLATE_DAILY_USE_LIMIT = 'REACH_TEMPLATE_DAILY_USE_LIMIT',
  TEMPLATE_BALANCE_NOT_ENOUGH = 'TEMPLATE_BALANCE_NOT_ENOUGH',
  TEMPLATE_CANNOT_RUN_ON_CLOUD = 'TEMPLATE_CANNOT_RUN_ON_CLOUD',
  TEMPLATE_NOT_AVAILABLE = 'TEMPLATE_NOT_AVAILABLE',
  UNKNOWN = 'UNKNOWN'
}

export const StartTaskDtoSchema = z.object({
  result: z.nativeEnum(StartTaskResult).optional(),
  errorCode: z.nativeEnum(StartTaskErrorCode).optional(),
  message: z.string().optional(),
  lotNo: z.string().optional(),
});
export type StartTaskDto = z.infer<typeof StartTaskDtoSchema>;


export const GetTaskStatusByIdListV2DtoSchema = z.object({
  taskId: z.string().optional(),
  status: z.string().optional(),
  currentTotalExtractCount: z.number().nullable().optional(),
  exported: z.boolean().optional(),
  executedTimes: z.number().nullable().optional(),
  subTaskCount: z.number().nullable().optional(),
  nextExecuteTime: z.string().nullable().optional(),
  endExecuteTime: z.string().nullable().optional(),
  executingTime: z.string().nullable().optional(),
  startExecuteTime: z.string().nullable().optional(),
  startExecuteTimeSeconds: z.number().nullable().optional(),
});
export type GetTaskStatusByIdListV2Dto = z.infer<typeof GetTaskStatusByIdListV2DtoSchema>;

export const GetTaskStatusDtoSchema = z.object({
  tId: z.string().optional(),
  lot: z.string().optional(),
  status: z.number().optional(),
  startTime: z.string().optional(),
  spendSeconds: z.number().optional(),
  dataCount: z.number().optional()
});
export type GetTaskStatusDto = z.infer<typeof GetTaskStatusDtoSchema>;

// Task group types
export const TaskGroupDtoSchema = z.object({
  taskGroupId: z.number().optional(),
  taskGroupName: z.string().optional(),
  userId: z.string().optional(),
  comment: z.string().nullable().optional(),
  creationTime: z.string().nullable().optional(),
  lastUpdate: z.string().nullable().optional(),
});
export type TaskGroupDto = z.infer<typeof TaskGroupDtoSchema>;

export interface TaskGroupIdsDto {
  groupId: number;
  taskIds: string[];
}

// Batch task types
export interface GetBatchTaskRequest {
  taskIds: string[];
}

// Batch task response
export const BatchTaskFailInfoSchema = z.object({
  taskId: z.string().optional(),
  taskName: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
  isTemplate: z.boolean().optional(),
});
export type BatchTaskFailInfo = z.infer<typeof BatchTaskFailInfoSchema>;

export const BatchTaskResponseSchema = z.object({
  failList: z.array(BatchTaskFailInfoSchema).optional(),
  taskInfoList: z.array(TaskInfoDtoSchema).optional(),
});
export type BatchTaskResponse = z.infer<typeof BatchTaskResponseSchema>;

export enum AsyncExportDataSourceType {
  TaskData = 0,
  TaskNotExportedData = 1,
  TaskLotData = 2,
  File = 3,
  LocalData = 99
}

export enum AsyncExportFileType {
  Excel = 0,
  CSV = 1,
  HTML = 2,
  JSON = 3,
  XML = 4,
  GoogleSheets = 5,
  ZapierFile = 6,
  Zip = 7,
  Mysql = 8,
  Oracle = 9,
  SqlServer = 10,
  PostgreSql = 11
}

export enum AsyncExportFileTypeCode {
  EXCEL = 'EXCEL',
  CSV = 'CSV',
  HTML = 'HTML',
  JSON = 'JSON',
  XML = 'XML',
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  ZAPIER_FILE = 'ZAPIER_FILE',
  ZIP = 'ZIP',
  MYSQL = 'MYSQL',
  ORACLE = 'ORACLE',
  SQL_SERVER = 'SQL_SERVER',
  POSTGRESQL = 'POSTGRESQL'
}

export enum AsyncExportFileStatus {
  WaitingGenerate = 0,
  Generating = 1,
  Generated = 2,
  Obselete = 3,
  Failed = 4
}

export const CreateAsyncCloudStorageExportRequestSchema = z.object({
  taskId: z.string().min(1),
  dataSourceType: z.nativeEnum(AsyncExportDataSourceType),
  exportFileType: z.nativeEnum(AsyncExportFileType),
});
export type CreateAsyncCloudStorageExportRequest = z.infer<typeof CreateAsyncCloudStorageExportRequestSchema>;

export const AsyncExportPreviewDataSchema = z.object({
  latestExportFileStatus: z.nativeEnum(AsyncExportFileStatus).nullish(),
  latestExportFileUrl: z.string().nullish(),
  exportProgressPercent: z.number().int().min(0).max(100).nullish(),
  collectedDataTotal: z.number().int().min(0).optional(),
  collectedDataSample: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type AsyncExportPreviewData = z.infer<typeof AsyncExportPreviewDataSchema>;

// Template types
export enum RunOn {
  Local = 1,
  Cloud = 2,
  Both = 3
}

export enum TemplateKindType {
  SYSTEM = 1,
  CUSTOM = 2
}

export const TemplateKindSchema = z.object({
  kindId: z.number(),
  kindName: z.string().optional(),
  sort: z.number().optional(),
  slug: z.string().nullable().optional(),
  language: z.number().optional(),
  type: z.nativeEnum(TemplateKindType).optional(),
});
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

export interface DataTypeOptions {
  MinLen?: number;
  MaxLen?: number;
  Min?: number;
  Max?: number;
  [key: string]: any;
}

export interface ControlOptions {
  WaitSeconds?: number;
  MinLines?: number;
  MaxLines?: number;
  Placeholder?: string;
  IsAPIEnabled?: boolean;
  IsFileImportEnabled?: boolean;
  [key: string]: any;
}

export interface TemplateParameter {
  Id: string;
  ParamName: string;
  DisplayText: string;
  IsRequired: boolean;
  DataType: string;
  DataTypeOptions?: DataTypeOptions;
  ControlType: string;
  ControlOptions?: ControlOptions;
  Remark?: string;
  marks?: Record<string, any>;
}

export const TemplateVersionDetailSchema = z.object({
  id: z.number(),
  version: z.number(),
  templateId: z.number(),
  parameters: z.string().optional(),
  outputSchema: z.string().optional(),
  command: z.string().optional(),
  fieldDataSource: z.string().optional()
});
export type TemplateVersionDetail = z.infer<typeof TemplateVersionDetailSchema>;

export enum TemplateUserPermissionType {
  None = 0,
  AccountLevelRight = 1,
  Trial = 2,
  CrossAccountLevelPricing = 3
}

export interface TemplateUserPermission {
  hasPermission?: boolean;
  permissionType?: TemplateUserPermissionType;
  price?: number;
}

export const TemplateVersionSchema = z.object({
  templateVersionId: z.number().optional(),
  version: z.number().optional(),
  type: z.number().optional(),
});
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;

export const TemplateViewSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  slug: z.string().optional(),
  pricePerData: z.number().nullable().optional(),
  currentVersion: TemplateVersionSchema.optional(),
  publishTime: z.string().nullable().optional(),
  creationTime: z.string().optional(),
  status: z.number().optional(),
  language: z.number().optional(),
  runOn: z.nativeEnum(RunOn).optional(),
  prompts: z.string().nullable().optional(),
  templateKinds: z.array(TemplateKindSchema).optional(),
  parameters: z.string().nullable().optional(),
  userPermission: z.object({
    hasPermission: z.boolean().optional(),
    permissionType: z.nativeEnum(TemplateUserPermissionType).optional(),
    price: z.number().optional(),
  }).optional(),
});
export type TemplateView = z.infer<typeof TemplateViewSchema>;

export interface QueryByPhraseTemplateRequest {
  keyword?: string;
  limit?: number;
  runOns?: string;
  isPublished?: boolean;
}

export const QueryByPhraseTemplateResultDtoSchema = z.object({
  id: z.number(),
  internalName: z.string().optional(),
  slug: z.string().optional(),
  pricePerData: z.number().nullable().optional(),
  likes: z.number().optional(),
  status: z.number().optional(),
  kindIds: z.array(z.number()).optional(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  accountLimit: z.array(z.number()).optional(),
  runOn: z.number().optional(),
  type: z.number().optional(),
  minClientVersion: z.string().nullable().optional(),
  lastModificationTime: z.string().nullable().optional(),
});
export type QueryByPhraseTemplateResultDto = z.infer<typeof QueryByPhraseTemplateResultDtoSchema>;

export const QueryByPhraseTemplateResponseSchema = z.object({
  data: z.array(QueryByPhraseTemplateResultDtoSchema),
});
export type QueryByPhraseTemplateResponse = z.infer<typeof QueryByPhraseTemplateResponseSchema>;

// Account level types
export enum AccountLevelDto {
  Free = 1,
  Basic = 9,
  Standard = 2,
  Professional = 3,
  Enterprise = 31,
  EnterprisePlus = 4,
  Personal = 110,
  Group = 120,
  Business = 130,
  BusinessMember = 140
}

// Account info
export const BasicUserInfoModelSchema = z.object({
  userId: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  accountLevel: z.nativeEnum(AccountLevelDto).optional(),
  currentAccountLevel: z.nativeEnum(AccountLevelDto).optional(),
  accountBalance: z.number().optional(),
  totalBalance: z.number().optional(),
  subscribe: z.boolean().optional(),
  nextBillingDate: z.string().nullable().optional()
});
export type BasicUserInfoModel = z.infer<typeof BasicUserInfoModelSchema>;

export const FileOffsetResultSchema = z.object({
  offset: z.number(),
  total: z.number(),
  restTotal: z.number(),
  fileIds: z.array(z.string()),
});
export type FileOffsetResult = z.infer<typeof FileOffsetResultSchema>;

// Marketing / coupon redeem types
export const CouponRedeemResultSchema = z.object({
  userCouponCodeId: z.string().optional(),
  userCode: z.string().optional(),
  grantTargetType: z.number().optional(),
  resourceType: z.number().optional(),
  coupon: z.unknown().nullable().optional(),
  resourceCount: z.number().nullable().optional(),
  rewardExpireTime: z.string().nullable().optional(),
  isSuccess: z.boolean(),
});
export type CouponRedeemResult = z.infer<typeof CouponRedeemResultSchema>;
