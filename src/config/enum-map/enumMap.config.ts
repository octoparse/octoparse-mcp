import type { EnumLabelMap } from './types.js';

const enumMap: EnumLabelMap = {
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
  TaskExecuteStatus: {
    '0': 'Unexecuted',
    '1': 'Waiting',
    '2': 'Executing',
    '3': 'Stopping',
    '4': 'Stopped',
    '5': 'Finished'
  },
  TaskRuleExecuteStatus: {
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

export default enumMap;
