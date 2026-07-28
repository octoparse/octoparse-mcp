export type EnumValueLabelMap = Record<string, string>;

export interface EnumLabelMap {
  AsyncExportFileStatus?: EnumValueLabelMap;
  AsyncExportFileType?: EnumValueLabelMap;
  StartTaskResult?: EnumValueLabelMap;
  TaskExecuteStatus?: EnumValueLabelMap;
  TaskRuleExecuteStatus?: EnumValueLabelMap;
  AccountLevelDto?: EnumValueLabelMap;
  RunOn?: EnumValueLabelMap;
  [enumName: string]: EnumValueLabelMap | undefined;
}
