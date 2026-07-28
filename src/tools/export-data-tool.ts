import { z } from 'zod';
import { OctoparseApi } from '../api/octoparse.js';
import {
  AsyncExportFileStatus,
  AsyncExportFileTypeCode,
  OctoparseApiError,
  TaskExecuteStatus
} from '../api/types.js';
import messages from '../config/messages.js';
import { InputValidator } from '../security/input-validator.js';
import { ExportStateService } from '../services/export-state-service.js';
import { EnumLabelUtil } from '../utils/enum-mapper.js';
import { RequestContextManager } from '../utils/request-context.js';
import { ToolDefinition } from './tool-definition.js';

const DEFAULT_PREVIEW_ROWS = 5;
const PREVIEW_HARD_CAP = 20;
const PREVIEW_TRUNCATE_AT = 128;
const EXPORT_POLL_DELAY_MS = 3000;
const EXPORT_POLL_RETRIES = 6;
const COLLECTING_RETRY_MIN_SECONDS = 10;
const COLLECTING_RETRY_MAX_SECONDS = 30;

interface ExportToolError {
  success: false;
  error: string;
  message: string;
  recoverable?: boolean;
  [key: string]: unknown;
}

async function resolveApiInstance(
  apiOrFactory: OctoparseApi | (() => Promise<OctoparseApi | undefined>) | undefined
): Promise<OctoparseApi | undefined> {
  if (typeof apiOrFactory === 'function') {
    return apiOrFactory();
  }
  return apiOrFactory;
}

function buildExportToolError(
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
): ExportToolError {
  return {
    success: false,
    error,
    message,
    ...extra
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRetryGuidance(
  waitSecondsMin: number,
  waitSecondsMax: number,
  exportFileType: string
) {
  const secondsText = `${waitSecondsMin}-${waitSecondsMax} seconds`;

  return {
    tool: 'export_data' as const,
    waitSecondsMin,
    waitSecondsMax,
    instruction:
      `Wait ${secondsText}, then call export_data again with the same taskId` +
      `${exportFileType ? ` and exportFileType="${exportFileType}"` : ''}.`
  };
}

function isTaskFinishedForExport(status?: number): boolean {
  return status === TaskExecuteStatus.Stopped || status === TaskExecuteStatus.Stopping || status === TaskExecuteStatus.Finished;
}

function isAsyncExportAlreadyRunningError(error: unknown): boolean {
  if (error instanceof OctoparseApiError) {
    return error.statusCode === 400 && error.code === 'WebTaskExportCannotRepeat';
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('WebTaskExportCannotRepeat');
}

function truncatePreviewValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > PREVIEW_TRUNCATE_AT
      ? `${value.slice(0, PREVIEW_TRUNCATE_AT)}...`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => truncatePreviewValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        truncatePreviewValue(nested)
      ])
    );
  }

  return value;
}

function truncatePreviewRows(rows: Array<Record<string, unknown>>, requestedRows: number): Array<Record<string, unknown>> {
  if (requestedRows <= 0) {
    return [];
  }

  return rows
    .slice(0, requestedRows)
    .map((row) => truncatePreviewValue(row) as Record<string, unknown>);
}

async function resolveExportUserIdentity(api: OctoparseApi): Promise<string> {
  const context = RequestContextManager.getContext();
  const requestIdentity =
    context?.userId || context?.apiKeyId || context?.sessionId;
  if (requestIdentity) {
    return requestIdentity;
  }

  try {
    return (await api.getUserId()) || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function buildCollectingToolHint(): string {
  return `Task is still collecting data. If this run came from execute_task, prefer tasks/get or tasks/result on the MCP task until execution completes. For direct Octoparse taskIds, wait ${COLLECTING_RETRY_MIN_SECONDS}-${COLLECTING_RETRY_MAX_SECONDS} seconds and call export_data again with the same taskId and exportFileType.`;
}

function buildExportingToolHint(): string {
  return `Export is still being generated. Wait ${COLLECTING_RETRY_MIN_SECONDS}-${COLLECTING_RETRY_MAX_SECONDS} seconds and call export_data again with the same taskId and exportFileType.`;
}

function buildExportedToolHint(hasSampleData: boolean): string {
  return hasSampleData
    ? 'Show exportFileUrl to the user. Present sampleData as a table. Do not download or parse the file unless the user explicitly asks for file-based extraction.'
    : 'Show exportFileUrl to the user. Do not download or parse the file unless the user explicitly asks for file-based extraction.';
}

const exportDataInputSchema = z.object({
  taskId: InputValidator.createTaskIdSchema().describe(
    'Task id from execute_task or an existing Octoparse task.'
  ),
  exportFileType: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }
      return EnumLabelUtil.normalizeAsyncExportFileTypeCode(value) ?? value;
    },
    z
      .nativeEnum(AsyncExportFileTypeCode)
      .optional()
      .default(AsyncExportFileTypeCode.JSON)
      .describe(
        'Optional. Export file type string enum. Supported values: EXCEL, CSV, HTML, JSON, XML'
      )
  ),
  previewRows: z
    .number()
    .int()
    .min(0)
    .max(PREVIEW_HARD_CAP)
    .optional()
    .describe(
      `Optional. Preview row count. Default ${DEFAULT_PREVIEW_ROWS}. Set 0 to skip sampleData in the response.`
    )
});

export const exportDataTool: ToolDefinition = {
  name: 'export_data',
  title: messages.tools.exportData.title,
  description: messages.tools.exportData.description,
  requiresAuth: true,
  annotations: { readOnlyHint: false, openWorldHint: false },
  inputSchema: exportDataInputSchema,
  handler: async (input, apiOrFactory) => {
    const api = await resolveApiInstance(apiOrFactory);
    if (!api) {
      throw new Error('API instance required');
    }

    const requestedPreviewRows = Math.max(input.previewRows ?? DEFAULT_PREVIEW_ROWS, 0);
    const previewSampleSize = Math.min(Math.max(requestedPreviewRows, 1), PREVIEW_HARD_CAP);
    const exportFileType = EnumLabelUtil.mapAsyncExportFileTypeCodeToValue(
      input.exportFileType
    );

    try {
      const taskStatus = await api.getTaskStatusById(input.taskId);
      if (!taskStatus || typeof taskStatus !== 'object') {
        return buildExportToolError(
          'task_status_unavailable',
          `Task status is unavailable for task ${input.taskId}.`,
          {
            recoverable: true,
            taskId: input.taskId,
            exportFileType: input.exportFileType
          }
        );
      }
      const taskStatusCode = taskStatus.status;
      const lot = taskStatus.lot;
      const dataCount = taskStatus.dataCount;

      if (!isTaskFinishedForExport(taskStatusCode)) {
        return {
          success: true,
          taskId: input.taskId,
          exportFileType: input.exportFileType,
          status: 'collecting' as const,
          ...(lot !== undefined ? { lot } : {}),
          ...(dataCount !== undefined ? { dataTotal: dataCount } : {}),
          ...(taskStatusCode !== undefined
            ? {
              taskStatus: taskStatusCode,
              taskStatusLabel: EnumLabelUtil.taskExecuteStatus(taskStatusCode)
            }
            : {}),
          retryGuidance: buildRetryGuidance(
            COLLECTING_RETRY_MIN_SECONDS,
            COLLECTING_RETRY_MAX_SECONDS,
            input.exportFileType
          ),
          toolHint: buildCollectingToolHint(),
          message:
            `Task is still collecting data. If this run came from execute_task, prefer tasks/get or tasks/result on the MCP task until execution completes. Otherwise call export_data again in ${COLLECTING_RETRY_MIN_SECONDS}-${COLLECTING_RETRY_MAX_SECONDS} seconds with the same taskId and exportFileType.`,
          suggestion:
            `Call export_data again in ${COLLECTING_RETRY_MIN_SECONDS}-${COLLECTING_RETRY_MAX_SECONDS} seconds with the same taskId and exportFileType.`
        };
      }

      if (lot === undefined || lot === null) {
        return buildExportToolError(
          'task_lot_missing',
          `Task ${input.taskId} is finished, but no lot was returned by getTaskStatusById.`,
          {
            recoverable: true,
            taskId: input.taskId,
            exportFileType: input.exportFileType
          }
        );
      }

      const userIdentity = await resolveExportUserIdentity(api);
      const cachedState = await ExportStateService.getState(
        userIdentity,
        input.taskId,
        exportFileType,
        lot
      );

      if (!cachedState?.createTriggered) {
        const locked = await ExportStateService.tryAcquireCreateLock(
          userIdentity,
          input.taskId,
          exportFileType,
          lot
        );

        if (locked) {
          try {
            const rechecked = await ExportStateService.getState(
              userIdentity,
              input.taskId,
              exportFileType,
              lot
            );

            if (!rechecked?.createTriggered) {
              try {
                await api.createAsyncCloudStorageExport(input.taskId, exportFileType);
              } catch (error) {
                if (!isAsyncExportAlreadyRunningError(error)) {
                  throw error;
                }
              }

              await ExportStateService.savePollingState(
                userIdentity,
                input.taskId,
                exportFileType,
                {
                  lot,
                  createTriggered: true,
                  latestExportFileStatus: AsyncExportFileStatus.WaitingGenerate,
                  exportProgressPercent: 0
                }
              );
            }
          } finally {
            await ExportStateService.releaseCreateLock(
              userIdentity,
              input.taskId,
              exportFileType,
              lot
            );
          }
        }
      }

      let latestPreview:
        | {
          latestExportFileStatus?: AsyncExportFileStatus | null;
          latestExportFileUrl?: string | null;
          exportProgressPercent?: number | null;
          collectedDataTotal?: number;
          collectedDataSample?: Array<Record<string, unknown>>;
        }
        | undefined;

      await sleep(EXPORT_POLL_DELAY_MS);

      for (let attempt = 0; attempt <= EXPORT_POLL_RETRIES; attempt += 1) {
        latestPreview = await api.getLastExportPreview(input.taskId, previewSampleSize);
        const exportStatus = latestPreview.latestExportFileStatus ?? null;
        const collectedDataTotal = latestPreview.collectedDataTotal ?? 0;
        const collectedDataSample = latestPreview.collectedDataSample ?? [];

        if (exportStatus === AsyncExportFileStatus.Failed) {
          await ExportStateService.saveFailedState(
            userIdentity,
            input.taskId,
            exportFileType,
            {
              lot,
              createTriggered: true,
              exportProgressPercent: latestPreview.exportProgressPercent ?? null,
              collectedDataTotal,
              collectedDataSample
            }
          );

          return buildExportToolError(
            'export_failed',
            `Export generation failed for task ${input.taskId}.`,
            {
              recoverable: true,
              taskId: input.taskId,
              exportFileType: input.exportFileType,
              lot,
              latestExportFileStatus: exportStatus,
              latestExportFileStatusLabel: EnumLabelUtil.asyncExportFileStatus(exportStatus)
            }
          );
        }

        if (exportStatus === AsyncExportFileStatus.Generated) {
          const exportFileUrl = latestPreview.latestExportFileUrl ?? undefined;

          await ExportStateService.saveCompletedState(
            userIdentity,
            input.taskId,
            exportFileType,
            {
              lot,
              createTriggered: true,
              latestExportFileUrl: exportFileUrl ?? null,
              latestExportFileStatus: exportStatus,
              exportProgressPercent: latestPreview.exportProgressPercent ?? 100,
              collectedDataTotal,
              collectedDataSample
            }
          );

          if (collectedDataTotal === 0) {
            return {
              success: true,
              taskId: input.taskId,
              exportFileType: input.exportFileType,
              status: 'no_data' as const,
              lot,
              dataTotal: 0,
              latestExportFileStatus: exportStatus,
              latestExportFileStatusLabel: EnumLabelUtil.asyncExportFileStatus(exportStatus),
              ...(exportFileUrl ? { exportFileUrl } : {}),
              toolHint: buildExportedToolHint(false),
              message:
                'Export completed successfully, but no data was collected for this task.'
            };
          }

          const sampleData = truncatePreviewRows(collectedDataSample, requestedPreviewRows);
          const hasSampleData = sampleData.length > 0;

          return {
            success: true,
            taskId: input.taskId,
            exportFileType: input.exportFileType,
            status: 'exported' as const,
            lot,
            dataTotal: collectedDataTotal,
            latestExportFileStatus: exportStatus,
            latestExportFileStatusLabel: EnumLabelUtil.asyncExportFileStatus(exportStatus),
            ...(exportFileUrl ? { exportFileUrl } : {}),
            ...(hasSampleData ? { sampleData } : {}),
            ...(hasSampleData ? { sampleRowCount: sampleData.length } : {}),
            toolHint: buildExportedToolHint(hasSampleData),
            message: 'Export completed successfully.'
          };
        }

        await ExportStateService.savePollingState(
          userIdentity,
          input.taskId,
          exportFileType,
          {
            lot,
            createTriggered: true,
            latestExportFileStatus: exportStatus,
            latestExportFileUrl: latestPreview.latestExportFileUrl ?? null,
            exportProgressPercent: latestPreview.exportProgressPercent ?? null,
            collectedDataTotal,
            collectedDataSample
          }
        );

        if (attempt < EXPORT_POLL_RETRIES) {
          await sleep(EXPORT_POLL_DELAY_MS);
        }
      }

      const latestExportStatus = latestPreview?.latestExportFileStatus ?? null;

      return {
        success: true,
        taskId: input.taskId,
        exportFileType: input.exportFileType,
        status: 'exporting' as const,
        lot,
        ...(dataCount !== undefined ? { dataTotal: dataCount } : {}),
        ...(latestPreview?.latestExportFileUrl
          ? { exportFileUrl: latestPreview.latestExportFileUrl }
          : {}),
        ...(latestPreview?.exportProgressPercent !== undefined
          ? { exportProgressPercent: latestPreview.exportProgressPercent ?? null }
          : {}),
        ...(latestExportStatus !== null
          ? {
            latestExportFileStatus: latestExportStatus,
            latestExportFileStatusLabel: EnumLabelUtil.asyncExportFileStatus(latestExportStatus)
          }
          : {}),
        retryGuidance: buildRetryGuidance(
          COLLECTING_RETRY_MIN_SECONDS,
          COLLECTING_RETRY_MAX_SECONDS,
          input.exportFileType
        ),
        toolHint: buildExportingToolHint(),
        message: 'Export file is still being generated.',
        suggestion:
          `Call export_data again in ${COLLECTING_RETRY_MIN_SECONDS}-${COLLECTING_RETRY_MAX_SECONDS} seconds with the same taskId and exportFileType.`
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      const lowerMessage = errorMessage.toLowerCase();

      if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
        return buildExportToolError(
          'task_not_found',
          `Task ${input.taskId} was not found.`,
          {
            recoverable: true,
            taskId: input.taskId,
            exportFileType: input.exportFileType
          }
        );
      }

      if (
        lowerMessage.includes('permission') ||
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('forbidden')
      ) {
        return buildExportToolError(
          'task_access_denied',
          `Permission denied when exporting data for task ${input.taskId}.`,
          {
            recoverable: false,
            taskId: input.taskId,
            exportFileType: input.exportFileType
          }
        );
      }

      if (lowerMessage.includes('task status is empty') || lowerMessage.includes('task status is unavailable')) {
        return buildExportToolError(
          'task_status_unavailable',
          `Task status is unavailable for task ${input.taskId}.`,
          {
            recoverable: true,
            taskId: input.taskId,
            exportFileType: input.exportFileType
          }
        );
      }

      return buildExportToolError(
        'export_data_failed',
        `Failed to export data for task ${input.taskId}: ${errorMessage}`,
        {
          recoverable: true,
          taskId: input.taskId,
          exportFileType: input.exportFileType
        }
      );
    }
  }
};
