import { buildSourceSummary, resolveDependentSourceOptions } from './source-options-resolver.js';
import {
  alignParamMapToTemplateParamNames,
  buildInputSchemaForLlm,
  buildUserInputParametersFromParamMap,
  findMissingRequiredParamNames,
  isMeaningfulParameterValue,
  type LlmTemplateInputSchemaField,
  mergeServerOnlyDefaultsIntoParamMap
} from './template-parameter-builder.js';
import {
  ensureUIParametersDefaults,
  validateTemplateParameters,
  validateUserInputParameters,
  type NormalizedTemplateTaskUserInputParameters
} from './template-parameter-validation.js';
import type { TemplateSourceSchema } from './source-options-resolver.js';

export type TemplateExecutionReadinessStatus =
  | 'ready'
  | 'awaiting_source_selection'
  | 'invalid'
  | 'unsupported_template_contract';

export interface NormalizedParameterPreview {
  templateParameters: Array<{ paramName: string; value: unknown }>;
  uiParameterCount: number;
}

export interface TemplateExecutionPreflightResult {
  status: TemplateExecutionReadinessStatus;
  canExecuteNow: boolean;
  blockingIssues: string[];
  nextAction: string;
  inputSchema: LlmTemplateInputSchemaField[];
  normalizedParametersPreview: NormalizedParameterPreview;
  parameterContext: Record<string, unknown>;
  userInputParameters: NormalizedTemplateTaskUserInputParameters;
  sourceSummary: ReturnType<typeof buildSourceSummary>;
  sourceOptions: Record<string, Array<{ key: string; label: string }>>;
  awaitingDependency: Array<{ fieldKey: string; dependsOn: string }>;
  invalidSourceSelections: Array<{ fieldKey: string; selectedKey: string; allowedKeys: string[] }>;
  missingParamNames: string[];
  parameterKeyMappings: Array<{ from: string; to: string; strategy: string }>;
  ignoredParameterKeys: string[];
  meaningfulIgnoredKeys: string[];
  errorCode?: 'missing_required_parameters' | 'invalid_source_selection' | 'unmapped_parameters' | 'preflight_validation_failed';
  validationMessage?: string;
}

export function buildNormalizedParameterPreview(
  userInputParameters: {
    UIParameters: Array<{ Id: string; Value?: unknown }>;
    TemplateParameters: Array<{ ParamName: string; Value?: unknown }>;
  }
): NormalizedParameterPreview {
  return {
    templateParameters: userInputParameters.TemplateParameters.map((param) => ({
      paramName: param.ParamName,
      value: param.Value
    })),
    uiParameterCount: userInputParameters.UIParameters.length
  };
}

function buildNextAction(
  status: TemplateExecutionReadinessStatus,
  details: {
    missingParamNames: string[];
    sourceOptions: Record<string, Array<{ key: string; label: string }>>;
    meaningfulIgnoredKeys: string[];
  }
): string {
  if (status === 'ready') {
    return 'Parameters are ready. You can create and start the task now.';
  }

  if (status === 'awaiting_source_selection') {
    const nextField = Object.keys(details.sourceOptions)[0] || details.missingParamNames[0] || 'the dependent field';
    return `Select a source option key for ${nextField} and call execute_task again.`;
  }

  if (details.meaningfulIgnoredKeys.length > 0) {
    return `Replace unmapped parameter keys (${details.meaningfulIgnoredKeys.join(', ')}) with inputSchema.field keys before retrying.`;
  }

  if (details.missingParamNames.length > 0) {
    return `Provide the missing required parameters: ${details.missingParamNames.join(', ')}.`;
  }

  return 'Review the parameter format against inputSchema and retry.';
}

export function runTemplateExecutionPreflight(input: {
  templateParametersJson: string | null | undefined;
  sourceSchema: TemplateSourceSchema;
  paramMap: Record<string, unknown>;
}): TemplateExecutionPreflightResult {
  const { templateParametersJson, sourceSchema, paramMap } = input;
  const inputSchema = buildInputSchemaForLlm(templateParametersJson, { sourceSchema });
  const { alignedParamMap, mappings: parameterKeyMappings } = alignParamMapToTemplateParamNames(
    templateParametersJson,
    paramMap,
    { sourceSchema }
  );
  const mergedParamMap = mergeServerOnlyDefaultsIntoParamMap(templateParametersJson, alignedParamMap);
  const parameterContext = {
    ...paramMap,
    ...mergedParamMap
  };
  const sourceSummary = buildSourceSummary(sourceSchema);
  const dependentSourceResolution = resolveDependentSourceOptions(sourceSchema, parameterContext);
  const missingParamNames = findMissingRequiredParamNames(templateParametersJson, parameterContext, {
    sourceSchema
  });

  const userInputParameters = ensureUIParametersDefaults(
    buildUserInputParametersFromParamMap(templateParametersJson, parameterContext, { sourceSchema })
  );
  const normalizedParametersPreview = buildNormalizedParameterPreview(userInputParameters);

  const usedParamNames = new Set(userInputParameters.TemplateParameters.map((param) => param.ParamName));
  const consumedSourceInputKeys = new Set<string>();
  const fieldKeyMap = sourceSchema.fieldKeyMap || {};
  if (Object.keys(fieldKeyMap).length > 0) {
    for (const [fieldKey, fieldEntry] of Object.entries(fieldKeyMap)) {
      const wasApplied = userInputParameters.UIParameters.some((param) => param.Id === fieldEntry.fieldId);
      if (!wasApplied) {
        continue;
      }
      consumedSourceInputKeys.add(fieldKey);
      consumedSourceInputKeys.add(fieldEntry.field);
    }
  }

  const ignoredParameterKeys = Object.keys(paramMap).filter((key) => {
    if (consumedSourceInputKeys.has(key)) {
      return false;
    }
    if (usedParamNames.has(key)) {
      return false;
    }
    const mapped = parameterKeyMappings.find((mapping) => mapping.from === key);
    if (mapped && usedParamNames.has(mapped.to)) {
      return false;
    }
    return true;
  });
  const meaningfulIgnoredKeys = ignoredParameterKeys.filter((key) =>
    isMeaningfulParameterValue(paramMap[key])
  );

  if (dependentSourceResolution.invalidSelections.length > 0) {
    const blockingIssues = dependentSourceResolution.invalidSelections.map((item) => item.fieldKey);
    return {
      status: 'invalid',
      canExecuteNow: false,
      blockingIssues,
      nextAction: buildNextAction('invalid', {
        missingParamNames,
        sourceOptions: dependentSourceResolution.sourceOptions,
        meaningfulIgnoredKeys
      }),
      inputSchema,
      normalizedParametersPreview,
      parameterContext,
      userInputParameters,
      sourceSummary,
      sourceOptions: dependentSourceResolution.sourceOptions,
      awaitingDependency: dependentSourceResolution.awaitingDependency,
      invalidSourceSelections: dependentSourceResolution.invalidSelections,
      missingParamNames,
      parameterKeyMappings,
      ignoredParameterKeys,
      meaningfulIgnoredKeys,
      errorCode: 'invalid_source_selection',
      validationMessage:
        'One or more selected source-backed option keys are invalid for the current dependency state.'
    };
  }

  if (meaningfulIgnoredKeys.length > 0) {
    return {
      status: 'invalid',
      canExecuteNow: false,
      blockingIssues: meaningfulIgnoredKeys,
      nextAction: buildNextAction('invalid', {
        missingParamNames,
        sourceOptions: dependentSourceResolution.sourceOptions,
        meaningfulIgnoredKeys
      }),
      inputSchema,
      normalizedParametersPreview,
      parameterContext,
      userInputParameters,
      sourceSummary,
      sourceOptions: dependentSourceResolution.sourceOptions,
      awaitingDependency: dependentSourceResolution.awaitingDependency,
      invalidSourceSelections: dependentSourceResolution.invalidSelections,
      missingParamNames,
      parameterKeyMappings,
      ignoredParameterKeys,
      meaningfulIgnoredKeys,
      errorCode: 'unmapped_parameters',
      validationMessage: `These parameter keys were not applied to the template (values would be dropped): ${meaningfulIgnoredKeys.join(', ')}. Use \`inputSchema[].field\` keys only; generic aliases like "keyword" map to the primary search field when unambiguous.`
    };
  }

  const sourceBackedMissing = missingParamNames.filter((key) =>
    Object.prototype.hasOwnProperty.call(fieldKeyMap, key)
  );
  const blockingIssues =
    sourceBackedMissing.length > 0
      ? sourceBackedMissing
      : dependentSourceResolution.awaitingDependency.map((item) => item.fieldKey);

  if (blockingIssues.length > 0) {
    return {
      status: 'awaiting_source_selection',
      canExecuteNow: false,
      blockingIssues,
      nextAction: buildNextAction('awaiting_source_selection', {
        missingParamNames: blockingIssues,
        sourceOptions: dependentSourceResolution.sourceOptions,
        meaningfulIgnoredKeys
      }),
      inputSchema,
      normalizedParametersPreview,
      parameterContext,
      userInputParameters,
      sourceSummary,
      sourceOptions: dependentSourceResolution.sourceOptions,
      awaitingDependency: dependentSourceResolution.awaitingDependency,
      invalidSourceSelections: dependentSourceResolution.invalidSelections,
      missingParamNames,
      parameterKeyMappings,
      ignoredParameterKeys,
      meaningfulIgnoredKeys,
      errorCode: 'missing_required_parameters',
      validationMessage: blockingIssues.length > 0 ? `Missing required source-backed parameters: ${blockingIssues.join(', ')}` : undefined
    };
  }

  if (missingParamNames.length > 0) {
    return {
      status: 'invalid',
      canExecuteNow: false,
      blockingIssues: missingParamNames,
      nextAction: buildNextAction('invalid', {
        missingParamNames,
        sourceOptions: dependentSourceResolution.sourceOptions,
        meaningfulIgnoredKeys
      }),
      inputSchema,
      normalizedParametersPreview,
      parameterContext,
      userInputParameters,
      sourceSummary,
      sourceOptions: dependentSourceResolution.sourceOptions,
      awaitingDependency: dependentSourceResolution.awaitingDependency,
      invalidSourceSelections: dependentSourceResolution.invalidSelections,
      missingParamNames,
      parameterKeyMappings,
      ignoredParameterKeys,
      meaningfulIgnoredKeys,
      errorCode: 'missing_required_parameters',
      validationMessage: `Missing required business parameters: ${missingParamNames.join(', ')}. Keys in "parameters" must use \`inputSchema[].field\`. For source-backed fields, use the selected option key from exact lookup (root level) or validateOnly (dependent level).`
    };
  }

  try {
    validateUserInputParameters(userInputParameters);
    validateTemplateParameters(userInputParameters, templateParametersJson || undefined);
  } catch (error) {
    return {
      status: 'invalid',
      canExecuteNow: false,
      blockingIssues: missingParamNames,
      nextAction: buildNextAction('invalid', {
        missingParamNames,
        sourceOptions: dependentSourceResolution.sourceOptions,
        meaningfulIgnoredKeys
      }),
      inputSchema,
      normalizedParametersPreview,
      parameterContext,
      userInputParameters,
      sourceSummary,
      sourceOptions: dependentSourceResolution.sourceOptions,
      awaitingDependency: dependentSourceResolution.awaitingDependency,
      invalidSourceSelections: dependentSourceResolution.invalidSelections,
      missingParamNames,
      parameterKeyMappings,
      ignoredParameterKeys,
      meaningfulIgnoredKeys,
      errorCode: 'preflight_validation_failed',
      validationMessage: error instanceof Error ? error.message : 'Parameter preflight validation failed.'
    };
  }

  return {
    status: 'ready',
    canExecuteNow: true,
    blockingIssues: [],
    nextAction: buildNextAction('ready', {
      missingParamNames,
      sourceOptions: dependentSourceResolution.sourceOptions,
      meaningfulIgnoredKeys
    }),
    inputSchema,
    normalizedParametersPreview,
    parameterContext,
    userInputParameters,
    sourceSummary,
    sourceOptions: dependentSourceResolution.sourceOptions,
    awaitingDependency: dependentSourceResolution.awaitingDependency,
    invalidSourceSelections: dependentSourceResolution.invalidSelections,
    missingParamNames,
    parameterKeyMappings,
    ignoredParameterKeys,
    meaningfulIgnoredKeys
  };
}
