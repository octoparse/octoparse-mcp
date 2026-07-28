import enumMap from '../config/enum-map/enumMap.config.js';
import type { EnumLabelMap } from '../config/enum-map/types.js';
import {
  AsyncExportFileType,
  AsyncExportFileTypeCode,
  StartTaskErrorCode,
  StartTaskResult
} from '../api/types.js';

const FALLBACK_MAP: EnumLabelMap = {
  AsyncExportFileStatus: {
    '0': 'WaitingGenerate',
    '1': 'Generating',
    '2': 'Generated',
    '3': 'Obsolete',
    '4': 'Failed'
  },
  AsyncExportFileType: {
    '0': 'EXCEL',
    '1': 'CSV',
    '2': 'HTML',
    '3': 'JSON',
    '4': 'XML',
    '5': 'GOOGLE_SHEETS',
    '6': 'ZAPIER_FILE',
    '7': 'ZIP',
    '8': 'MYSQL',
    '9': 'ORACLE',
    '10': 'SQL_SERVER',
    '11': 'POSTGRESQL'
  },
  StartTaskResult: {
    '0': 'SUCCESS',
    '1': 'ALREADY_RUNNING',
    '2': 'TASK_NOT_FOUND',
    '4': 'INSUFFICIENT_CREDITS',
    '5': 'TASK_DISABLED',
    '6': 'RATE_LIMIT_EXCEEDED',
    '7': 'UNKNOWN_ERROR',
    '1000': 'USER_NOT_FOUND',
    '1001': 'USER_SUSPENDED',
    '1002': 'USER_EXPIRED',
    '1003': 'USER_INSUFFICIENT_PERMISSION',
    '1004': 'USER_CREDIT_INSUFFICIENT'
  },
  StartTaskErrorCode: {
    NONE: 'NONE',
    ON_EXECUTING: 'ON_EXECUTING',
    FUNCTION_NOT_ENABLE: 'FUNCTION_NOT_ENABLE',
    USER_NOT_TASK_OWNER: 'USER_NOT_TASK_OWNER',
    SERVICE_ERROR: 'SERVICE_ERROR',
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
    FAILED_FOR_OTHER: 'FAILED_FOR_OTHER',
    REACH_TEMPLATE_DAILY_EXTRACT_LIMIT: 'REACH_TEMPLATE_DAILY_EXTRACT_LIMIT',
    REACH_TEMPLATE_DAILY_USE_LIMIT: 'REACH_TEMPLATE_DAILY_USE_LIMIT',
    TEMPLATE_BALANCE_NOT_ENOUGH: 'TEMPLATE_BALANCE_NOT_ENOUGH',
    TEMPLATE_CANNOT_RUN_ON_CLOUD: 'TEMPLATE_CANNOT_RUN_ON_CLOUD',
    TEMPLATE_NOT_AVAILABLE: 'TEMPLATE_NOT_AVAILABLE',
    UNKNOWN: 'UNKNOWN'
  },
  StartTaskErrorMessage: {
    NONE: 'Task start succeed',
    ON_EXECUTING: 'The task is already executing',
    FUNCTION_NOT_ENABLE: "You don't have permission",
    USER_NOT_TASK_OWNER: 'You are not the task owner',
    SERVICE_ERROR: 'Server error',
    TASK_NOT_FOUND: 'The task does not found',
    FAILED_FOR_OTHER: 'Unknown error',
    REACH_TEMPLATE_DAILY_EXTRACT_LIMIT: 'The template reach daily extract limit',
    REACH_TEMPLATE_DAILY_USE_LIMIT: 'The template reach daily use limit',
    TEMPLATE_BALANCE_NOT_ENOUGH: 'Insufficient template balance',
    TEMPLATE_CANNOT_RUN_ON_CLOUD: "The template task can't be run on cloud",
    TEMPLATE_NOT_AVAILABLE: 'The template is not available',
    UNKNOWN: 'Unknown error'
  },
  TaskExecuteStatus: {
    '0': 'Unexecuted',
    '1': 'Waiting',
    '2': 'Executing',
    '3': 'Stopping',
    '4': 'Stopped',
    '5': 'Finished'
  },
  TaskStatus: {
    '0': 'Running',
    '1': 'Stopped',
    '2': 'Completed',
    '3': 'Waiting',
    '5': 'Ready'
  },
  AccountLevelDto: {
    '1': 'Free',
    '2': 'Standard',
    '3': 'Professional',
    '4': 'Enterprise Plus',
    '9': 'Basic',
    '31': 'Enterprise',
    '110': 'Personal',
    '120': 'Group',
    '130': 'Business',
    '140': 'BusinessMember'
  },
  RunOn: {
    '1': 'Local only',
    '2': 'Cloud',
    '3': 'Cloud and local'
  }
};

const START_TASK_API_CODE_TO_ERROR_CODE: Readonly<Record<number, StartTaskErrorCode>> = {
  1: StartTaskErrorCode.NONE,
  2: StartTaskErrorCode.ON_EXECUTING,
  6: StartTaskErrorCode.FUNCTION_NOT_ENABLE,
  12: StartTaskErrorCode.TEMPLATE_BALANCE_NOT_ENOUGH
};

const ASYNC_EXPORT_FILE_TYPE_CODE_TO_VALUE: Readonly<Record<AsyncExportFileTypeCode, AsyncExportFileType>> = {
  [AsyncExportFileTypeCode.EXCEL]: AsyncExportFileType.Excel,
  [AsyncExportFileTypeCode.CSV]: AsyncExportFileType.CSV,
  [AsyncExportFileTypeCode.HTML]: AsyncExportFileType.HTML,
  [AsyncExportFileTypeCode.JSON]: AsyncExportFileType.JSON,
  [AsyncExportFileTypeCode.XML]: AsyncExportFileType.XML,
  [AsyncExportFileTypeCode.GOOGLE_SHEETS]: AsyncExportFileType.GoogleSheets,
  [AsyncExportFileTypeCode.ZAPIER_FILE]: AsyncExportFileType.ZapierFile,
  [AsyncExportFileTypeCode.ZIP]: AsyncExportFileType.Zip,
  [AsyncExportFileTypeCode.MYSQL]: AsyncExportFileType.Mysql,
  [AsyncExportFileTypeCode.ORACLE]: AsyncExportFileType.Oracle,
  [AsyncExportFileTypeCode.SQL_SERVER]: AsyncExportFileType.SqlServer,
  [AsyncExportFileTypeCode.POSTGRESQL]: AsyncExportFileType.PostgreSql
};

const START_TASK_ERROR_CODE_TO_RESULT: Readonly<Record<StartTaskErrorCode, StartTaskResult>> = {
  [StartTaskErrorCode.NONE]: StartTaskResult.SUCCESS,
  [StartTaskErrorCode.ON_EXECUTING]: StartTaskResult.ALREADY_RUNNING,
  [StartTaskErrorCode.FUNCTION_NOT_ENABLE]: StartTaskResult.USER_INSUFFICIENT_PERMISSION,
  [StartTaskErrorCode.USER_NOT_TASK_OWNER]: StartTaskResult.USER_INSUFFICIENT_PERMISSION,
  [StartTaskErrorCode.SERVICE_ERROR]: StartTaskResult.UNKNOWN_ERROR,
  [StartTaskErrorCode.TASK_NOT_FOUND]: StartTaskResult.TASK_NOT_FOUND,
  [StartTaskErrorCode.FAILED_FOR_OTHER]: StartTaskResult.UNKNOWN_ERROR,
  [StartTaskErrorCode.REACH_TEMPLATE_DAILY_EXTRACT_LIMIT]: StartTaskResult.RATE_LIMIT_EXCEEDED,
  [StartTaskErrorCode.REACH_TEMPLATE_DAILY_USE_LIMIT]: StartTaskResult.RATE_LIMIT_EXCEEDED,
  [StartTaskErrorCode.TEMPLATE_BALANCE_NOT_ENOUGH]: StartTaskResult.INSUFFICIENT_CREDITS,
  [StartTaskErrorCode.TEMPLATE_CANNOT_RUN_ON_CLOUD]: StartTaskResult.TASK_DISABLED,
  [StartTaskErrorCode.TEMPLATE_NOT_AVAILABLE]: StartTaskResult.TASK_DISABLED,
  [StartTaskErrorCode.UNKNOWN]: StartTaskResult.UNKNOWN_ERROR
};

function lookup(enumName: keyof EnumLabelMap | string, value: number | string | null | undefined): string {
  if (value === undefined || value === null) {
    return 'Unknown';
  }

  const key = String(value);
  return enumMap[enumName]?.[key] ?? FALLBACK_MAP[enumName]?.[key] ?? key;
}

export class EnumLabelUtil {
  static map(enumName: keyof EnumLabelMap | string, value: number | string | null | undefined): string {
    return lookup(enumName, value);
  }

  static asyncExportFileStatus(value: number | string | null | undefined): string {
    return lookup('AsyncExportFileStatus', value);
  }

  static asyncExportFileType(value: number | string | null | undefined): string {
    return lookup('AsyncExportFileType', value);
  }

  static startTaskResult(value: number | string | null | undefined): string {
    return lookup('StartTaskResult', value);
  }

  static startTaskErrorCode(value: number | string | null | undefined): string {
    return lookup('StartTaskErrorCode', value);
  }

  static startTaskErrorMessage(value: number | string | null | undefined): string {
    return lookup('StartTaskErrorMessage', value);
  }

  static mapStartTaskApiCodeToErrorCode(rawCode: number, upstreamMessage?: string): StartTaskErrorCode {
    const direct = START_TASK_API_CODE_TO_ERROR_CODE[rawCode];
    if (direct) {
      return direct;
    }

    const message = upstreamMessage?.toLowerCase() ?? '';
    if (rawCode === 8) {
      return message.includes('not available')
        ? StartTaskErrorCode.TEMPLATE_NOT_AVAILABLE
        : StartTaskErrorCode.TEMPLATE_CANNOT_RUN_ON_CLOUD;
    }

    if (rawCode === 13) {
      return message.includes('use limit')
        ? StartTaskErrorCode.REACH_TEMPLATE_DAILY_USE_LIMIT
        : StartTaskErrorCode.REACH_TEMPLATE_DAILY_EXTRACT_LIMIT;
    }

    if (rawCode === 100) {
      if (message.includes('not the task owner')) {
        return StartTaskErrorCode.USER_NOT_TASK_OWNER;
      }
      if (message.includes('server error')) {
        return StartTaskErrorCode.SERVICE_ERROR;
      }
      if (message.includes('not found') || message.includes('does not found')) {
        return StartTaskErrorCode.TASK_NOT_FOUND;
      }
      return StartTaskErrorCode.FAILED_FOR_OTHER;
    }

    return StartTaskErrorCode.UNKNOWN;
  }

  static mapStartTaskErrorCodeToResult(errorCode: StartTaskErrorCode): StartTaskResult {
    return START_TASK_ERROR_CODE_TO_RESULT[errorCode] ?? StartTaskResult.UNKNOWN_ERROR;
  }

  static normalizeAsyncExportFileTypeCode(
    value: string | null | undefined
  ): AsyncExportFileTypeCode | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/[\s-]+/g, '_')
      .toUpperCase();

    switch (normalized) {
      case 'EXCEL':
        return AsyncExportFileTypeCode.EXCEL;
      case 'CSV':
        return AsyncExportFileTypeCode.CSV;
      case 'HTML':
        return AsyncExportFileTypeCode.HTML;
      case 'JSON':
        return AsyncExportFileTypeCode.JSON;
      case 'XML':
        return AsyncExportFileTypeCode.XML;
      case 'GOOGLE_SHEETS':
      case 'GOOGLESHEETS':
        return AsyncExportFileTypeCode.GOOGLE_SHEETS;
      case 'ZAPIER_FILE':
      case 'ZAPIERFILE':
        return AsyncExportFileTypeCode.ZAPIER_FILE;
      case 'ZIP':
        return AsyncExportFileTypeCode.ZIP;
      case 'MYSQL':
        return AsyncExportFileTypeCode.MYSQL;
      case 'ORACLE':
        return AsyncExportFileTypeCode.ORACLE;
      case 'SQL_SERVER':
      case 'SQLSERVER':
        return AsyncExportFileTypeCode.SQL_SERVER;
      case 'POSTGRESQL':
      case 'POSTGRES':
        return AsyncExportFileTypeCode.POSTGRESQL;
      default:
        return undefined;
    }
  }

  static mapAsyncExportFileTypeCodeToValue(code: AsyncExportFileTypeCode): AsyncExportFileType {
    return ASYNC_EXPORT_FILE_TYPE_CODE_TO_VALUE[code] ?? AsyncExportFileType.JSON;
  }

  static taskRuleExecuteStatus(value: number | string | null | undefined): string {
    return lookup('TaskRuleExecuteStatus', value);
  }

  static taskExecuteStatus(value: number | string | null | undefined): string {
    return lookup('TaskExecuteStatus', value);
  }

  static taskStatus(value: number | string | null | undefined): string {
    return this.taskExecuteStatus(value);
  }

  static accountLevel(value: number | string | null | undefined): string {
    return lookup('AccountLevelDto', value);
  }

  static runOnLabel(value: number | string | null | undefined): string {
    return lookup('RunOn', value);
  }
}
