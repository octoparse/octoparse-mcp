import type { DataTypeOptions, TemplateParameter } from '../api/types.js';
import { Logger } from '../utils/logger.js';

export interface TemplateTaskUIParameter {
  Id: string;
  Value?: any;
  Customize?: any;
  sourceTaskId?: string;
  sourceField?: string;
}

export interface TemplateTaskTemplateParameter {
  ParamName: string;
  Value?: any;
}

export interface TemplateTaskUserInputParameters {
  UIParameters: TemplateTaskUIParameter[];
  TemplateParameters: TemplateTaskTemplateParameter[];
}

export interface NormalizedTemplateTaskUIParameter extends TemplateTaskUIParameter {
  Customize: any;
  sourceTaskId: string;
  sourceField: string;
}

export interface NormalizedTemplateTaskUserInputParameters {
  UIParameters: NormalizedTemplateTaskUIParameter[];
  TemplateParameters: TemplateTaskTemplateParameter[];
}

const validationLog = Logger.createNamedLogger('octoparse.tools.template-parameter-validation');

const ARRAY_VALUED_CONTROL_TYPES = new Set([
  'multiinput',
  'checkboxlist',
  'multiselect',
  'checklist'
]);

function formatValidationError(config: {
  title: string;
  errors: string[];
  summary?: Record<string, string | number>;
  additionalInfo?: string;
  footer?: string;
}): string {
  const { title, errors, summary, additionalInfo, footer } = config;

  const errorHeader = `\n${'='.repeat(80)}\n🚨 ${title}\n${'='.repeat(80)}`;

  let summaryText = '';
  if (summary && Object.keys(summary).length > 0) {
    summaryText = `\n\n📋 SUMMARY:\n${Object.entries(summary)
      .map(([key, value]) => `   - ${key}: ${value}`)
      .join('\n')}`;
  }

  const additionalInfoText = additionalInfo ? `\n\n${additionalInfo}` : '';

  const errorDetails = `\n\n📝 DETAILED ERRORS:\n${errors
    .map((err, idx) => `   ${idx + 1}. ${err}`)
    .join('\n')}`;

  const footerText = footer ? `\n\n${footer}` : '';

  return `${errorHeader}${summaryText}${additionalInfoText}${errorDetails}${footerText}\n${'='.repeat(80)}\n`;
}

export function ensureUIParametersDefaults(
  userInputParameters?: TemplateTaskUserInputParameters
): NormalizedTemplateTaskUserInputParameters {
  if (!userInputParameters) {
    return {
      UIParameters: [],
      TemplateParameters: []
    };
  }

  const safeUIParameters = Array.isArray(userInputParameters.UIParameters)
    ? userInputParameters.UIParameters
    : [];
  const safeTemplateParameters = Array.isArray(userInputParameters.TemplateParameters)
    ? userInputParameters.TemplateParameters
    : [];

  const normalizedUIParameters = safeUIParameters.map((param) => ({
    Id: param.Id,
    Value: param.Value,
    Customize: param.Customize || { taskUrlRuleParam: [] },
    sourceTaskId: param.sourceTaskId || '',
    sourceField: param.sourceField || ''
  }));

  return {
    UIParameters: normalizedUIParameters,
    TemplateParameters: safeTemplateParameters
  };
}

export function validateMultiInputArray(
  value: any,
  paramId: string,
  paramName: string,
  isUIParam: boolean,
  controlType: string = 'MultiInput'
): string | null {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    const location = isUIParam ? `UIParameters[${paramId}]` : `TemplateParameters[${paramName}]`;
    const displayName = isUIParam ? `${location} (${paramName})` : location;
    return `${displayName}: ControlType is "${controlType}" but Value is NOT an array. Got type: ${typeof value}. REQUIRED format: Value must be an ARRAY, even for single values. Example: Value: ["single_value"] or Value: ["value1", "value2"]. Current value: ${JSON.stringify(value)}`;
  }
  return null;
}

function controlTypeRequiresArray(controlType?: string): boolean {
  return !!controlType && ARRAY_VALUED_CONTROL_TYPES.has(controlType.toLowerCase());
}

export function validateParameterType(
  value: any,
  expectedType: string,
  options?: DataTypeOptions,
  paramName: string = 'parameter',
  throwError: boolean = true,
  controlType?: string
): string | null {
  if (!expectedType) {
    return null;
  }

  const handleError = (errorMsg: string): string | null => {
    if (throwError) {
      throw new Error(errorMsg);
    }
    return errorMsg;
  };

  switch (expectedType.toLowerCase()) {
    case 'string':
      if (controlTypeRequiresArray(controlType) && Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const element = value[i];
          const elementType = typeof element;

          if (
            element !== null &&
            element !== undefined &&
            elementType !== 'string' &&
            elementType !== 'object'
          ) {
            return handleError(
              `${paramName}[${i}] must be a string or object for MultiInput control with DataType="string", ` +
                `but got ${elementType}. ` +
                `Expected formats:\n` +
                `  - Simple strings: ["keyword1", "keyword2"]\n` +
                `  - Complex objects: [{"key": "keyword1"}, {"key": "keyword2"}]\n` +
                `  - Mixed: ["simple", {"key": "complex"}]\n` +
                `Current value at index ${i}: ${JSON.stringify(element)}`
            );
          }

          if (elementType === 'string' && options) {
            if (options.MinLen !== undefined && element.length < options.MinLen) {
              return handleError(
                `${paramName}[${i}] must be at least ${options.MinLen} characters long, ` +
                  `but got ${element.length} characters: "${element}"`
              );
            }
            if (options.MaxLen !== undefined && element.length > options.MaxLen) {
              return handleError(
                `${paramName}[${i}] must be no more than ${options.MaxLen} characters long, ` +
                  `but got ${element.length} characters: "${element}"`
              );
            }
          }
        }

        return null;
      }

      if (value !== null && value !== undefined && typeof value !== 'string') {
        return handleError(
          `${paramName} must be a string, but got ${typeof value}. Expected: "${paramName}": "some_value"`
        );
      }
      if (typeof value === 'string' && options) {
        if (options.MinLen !== undefined && value.length < options.MinLen) {
          return handleError(
            `${paramName} must be at least ${options.MinLen} characters long, but got ${value.length} characters: "${value}"`
          );
        }
        if (options.MaxLen !== undefined && value.length > options.MaxLen) {
          return handleError(
            `${paramName} must be no more than ${options.MaxLen} characters long, but got ${value.length} characters: "${value}"`
          );
        }
      }
      break;

    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double': {
      const numValue = Number(value);
      if (value !== null && value !== undefined && (isNaN(numValue) || typeof value === 'object')) {
        return handleError(
          `${paramName} must be a number, but got ${typeof value}. Expected: "${paramName}": 123`
        );
      }
      if (!isNaN(numValue) && options) {
        if (options.Min !== undefined && numValue < options.Min) {
          return handleError(`${paramName} must be at least ${options.Min}, but got ${numValue}`);
        }
        if (options.Max !== undefined && numValue > options.Max) {
          return handleError(`${paramName} must be no more than ${options.Max}, but got ${numValue}`);
        }
      }
      break;
    }

    case 'boolean':
      if (
        value !== null &&
        value !== undefined &&
        typeof value !== 'boolean' &&
        !['true', 'false', true, false].includes(value)
      ) {
        return handleError(
          `${paramName} must be a boolean, but got ${typeof value}. Expected: "${paramName}": true`
        );
      }
      break;

    case 'array':
    case 'list':
      if (value !== null && value !== undefined && !Array.isArray(value)) {
        return handleError(
          `${paramName} must be an array, but got ${typeof value}. Expected: "${paramName}": ["item1", "item2"]`
        );
      }
      break;

    default:
      validationLog.warn('Unknown template parameter data type, skipping strict validation', {
        meta: {
          expectedType,
          paramName
        }
      });
      break;
  }

  return null;
}

export function validateUserInputParameters(
  userInputParameters?: TemplateTaskUserInputParameters,
  paramName: string = 'userInputParameters'
): void {
  if (!userInputParameters) {
    return;
  }

  const errors: string[] = [];
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (!userInputParameters.UIParameters) {
    missingFields.push('UIParameters');
    errors.push(
      `${paramName}.UIParameters is REQUIRED but missing. Please provide an array of UI parameters with structure: [{Id: "param_id", Value: "param_value"}]`
    );
  }
  if (!userInputParameters.TemplateParameters) {
    missingFields.push('TemplateParameters');
    errors.push(
      `${paramName}.TemplateParameters is REQUIRED but missing. Please provide an array of template parameters with structure: [{ParamName: "param_name", Value: "param_value"}]`
    );
  }

  if (userInputParameters.UIParameters) {
    if (!Array.isArray(userInputParameters.UIParameters)) {
      invalidFields.push('UIParameters (not an array)');
      errors.push(
        `${paramName}.UIParameters must be an array. Got: ${typeof userInputParameters.UIParameters}`
      );
    } else {
      for (let i = 0; i < userInputParameters.UIParameters.length; i++) {
        const uiParam = userInputParameters.UIParameters[i];
        if (!uiParam || typeof uiParam !== 'object') {
          invalidFields.push(`UIParameters[${i}]`);
          errors.push(
            `${paramName}.UIParameters[${i}] must be an object. Expected: {Id: "param_id", Value: "value"}. Got: ${JSON.stringify(uiParam)}`
          );
        } else if (typeof uiParam.Id !== 'string') {
          if (uiParam.Id === undefined || uiParam.Id === null) {
            missingFields.push(`UIParameters[${i}].Id`);
            errors.push(
              `${paramName}.UIParameters[${i}].Id is REQUIRED but missing. Please provide a string parameter ID.`
            );
          } else {
            invalidFields.push(`UIParameters[${i}].Id`);
            errors.push(
              `${paramName}.UIParameters[${i}].Id must be a string. Got: ${typeof uiParam.Id} (${JSON.stringify(uiParam.Id)})`
            );
          }
        }
      }
    }
  }

  if (userInputParameters.TemplateParameters) {
    if (!Array.isArray(userInputParameters.TemplateParameters)) {
      invalidFields.push('TemplateParameters (not an array)');
      errors.push(
        `${paramName}.TemplateParameters must be an array. Got: ${typeof userInputParameters.TemplateParameters}`
      );
    } else {
      for (let i = 0; i < userInputParameters.TemplateParameters.length; i++) {
        const templateParam = userInputParameters.TemplateParameters[i];
        if (!templateParam || typeof templateParam !== 'object') {
          invalidFields.push(`TemplateParameters[${i}]`);
          errors.push(
            `${paramName}.TemplateParameters[${i}] must be an object. Expected: {ParamName: "param_name", Value: "value"}. Got: ${JSON.stringify(templateParam)}`
          );
        } else if (typeof templateParam.ParamName !== 'string') {
          if (templateParam.ParamName === undefined || templateParam.ParamName === null) {
            missingFields.push(`TemplateParameters[${i}].ParamName`);
            errors.push(
              `${paramName}.TemplateParameters[${i}].ParamName is REQUIRED but missing. Please provide a string parameter name.`
            );
          } else {
            invalidFields.push(`TemplateParameters[${i}].ParamName`);
            errors.push(
              `${paramName}.TemplateParameters[${i}].ParamName must be a string. Got: ${typeof templateParam.ParamName} (${JSON.stringify(templateParam.ParamName)})`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      formatValidationError({
        title: 'USER INPUT PARAMETERS VALIDATION FAILED',
        errors,
        summary: {
          'Total errors found': errors.length,
          'Missing required fields': missingFields.length > 0 ? missingFields.join(', ') : 'None',
          'Invalid fields': invalidFields.length > 0 ? invalidFields.join(', ') : 'None'
        },
        footer:
          '💡 CRITICAL REQUIREMENTS:\n' +
          '   ✓ Both UIParameters and TemplateParameters arrays are REQUIRED\n' +
          '   ✓ UIParameters format: [{Id: "param_id", Value: "value"}]\n' +
          '   ✓ TemplateParameters format: [{ParamName: "param_name", Value: "value"}]\n' +
          '   ✓ Parameters must be paired: every UIParameter must have a corresponding TemplateParameter\n' +
          '   ✓ CRITICAL: If ControlType="MultiInput", Value MUST be an ARRAY (even for single values)\n' +
          '      - ❌ WRONG: {Value: "keyword"} \n' +
          '      - ✅ CORRECT: {Value: ["keyword"]}\n' +
          '      - ✅ CORRECT: {Value: ["keyword1", "keyword2"]}\n' +
          '   ✓ Get parameter schema from getTemplateView() before calling this tool'
      })
    );
  }
}

export function validateTemplateParameters(
  userInputParameters?: TemplateTaskUserInputParameters,
  templateParametersJson?: string
): void {
  if (!userInputParameters || !templateParametersJson) {
    return;
  }

  try {
    const templateParams: Array<TemplateParameter> = JSON.parse(templateParametersJson);

    if (!Array.isArray(templateParams) || templateParams.length === 0) {
      return;
    }

    const errors: string[] = [];
    const missingRequiredParams: string[] = [];
    const typeErrors: string[] = [];

    const requiredParams = templateParams.filter((param) => param.IsRequired);

    if (requiredParams.length > 0) {
      const providedUIParamIds = new Set(userInputParameters.UIParameters.map((param) => param.Id));
      const missingUIParams = requiredParams.filter((param) => !providedUIParamIds.has(param.Id));

      const providedTemplateParamNames = new Set(
        userInputParameters.TemplateParameters.map((param) => param.ParamName)
      );
      const missingTemplateParams = requiredParams.filter(
        (param) => !providedTemplateParamNames.has(param.ParamName)
      );

      if (missingUIParams.length > 0) {
        missingUIParams.forEach((param) => {
          missingRequiredParams.push(`${param.ParamName || param.Id} (Id: ${param.Id})`);
          const description = param.DisplayText || param.Remark || '';
          errors.push(
            `Missing REQUIRED parameter in UIParameters: Id="${param.Id}" (ParamName: "${param.ParamName}")${description ? ` - ${description}` : ''}`
          );
        });
      }

      if (missingTemplateParams.length > 0) {
        missingTemplateParams.forEach((param) => {
          if (!missingRequiredParams.includes(`${param.ParamName || param.Id} (Id: ${param.Id})`)) {
            missingRequiredParams.push(`${param.ParamName || param.Id}`);
          }
          const description = param.DisplayText || param.Remark || '';
          errors.push(
            `Missing REQUIRED parameter in TemplateParameters: ParamName="${param.ParamName}" (Id: ${param.Id})${description ? ` - ${description}` : ''}`
          );
        });
      }
    }

    for (const param of templateParams) {
      const options = { ...(param.DataTypeOptions || {}) };
      if (options.MinLen === undefined || options.MinLen === null) {
        options.MinLen = param.IsRequired ? 1 : 0;
      }
      if (options.MaxLen === undefined || options.MaxLen === null) {
        options.MaxLen = 999999;
      }

      const providedUIParam = userInputParameters.UIParameters.find((p) => p.Id === param.Id);
      if (providedUIParam) {
        if (param.DataType) {
          const typeError = validateParameterType(
            providedUIParam.Value,
            param.DataType,
            options,
            `UIParameters[${param.Id}]`,
            false,
            param.ControlType
          );
          if (typeError) {
            typeErrors.push(`UIParameters[${param.Id}]`);
            errors.push(typeError);
          }
        }

        if (controlTypeRequiresArray(param.ControlType)) {
          const multiInputError = validateMultiInputArray(
            providedUIParam.Value,
            param.Id,
            param.ParamName,
            true,
            param.ControlType
          );
          if (multiInputError) {
            typeErrors.push(`UIParameters[${param.Id}] - ${param.ControlType} requires array`);
            errors.push(multiInputError);
          }
        }
      }

      const providedTemplateParam = userInputParameters.TemplateParameters.find(
        (p) => p.ParamName === param.ParamName
      );
      if (providedTemplateParam) {
        if (param.DataType) {
          const typeError = validateParameterType(
            providedTemplateParam.Value,
            param.DataType,
            options,
            `TemplateParameters[${param.ParamName}]`,
            false,
            param.ControlType
          );
          if (typeError) {
            typeErrors.push(`TemplateParameters[${param.ParamName}]`);
            errors.push(typeError);
          }
        }

        if (controlTypeRequiresArray(param.ControlType)) {
          const multiInputError = validateMultiInputArray(
            providedTemplateParam.Value,
            param.Id,
            param.ParamName,
            false,
            param.ControlType
          );
          if (multiInputError) {
            typeErrors.push(`TemplateParameters[${param.ParamName}] - ${param.ControlType} requires array`);
            errors.push(multiInputError);
          }
        }
      }
    }

    if (errors.length > 0) {
      const templateInfo =
        `📦 TEMPLATE REQUIREMENTS:\n   - Total parameters in template: ${templateParams.length}\n` +
        `   - Required parameters: ${requiredParams.length > 0 ? requiredParams.map((p) => p.ParamName || p.Id).join(', ') : 'None'}`;

      throw new Error(
        formatValidationError({
          title: 'TEMPLATE PARAMETER VALIDATION FAILED',
          errors,
          summary: {
            'Total errors found': errors.length,
            'Missing required parameters':
              missingRequiredParams.length > 0 ? missingRequiredParams.length : 'None',
            'Type validation errors': typeErrors.length > 0 ? typeErrors.length : 'None'
          },
          additionalInfo: templateInfo,
          footer:
            '💡 HOW TO FIX:\n' +
            '   ✓ Call getTemplateView(templateId) to get the complete parameter schema\n' +
            '   ✓ Check the \'parameters\' field in the template response\n' +
            '   ✓ Ensure all required parameters (IsRequired=true) are provided\n' +
            '   ✓ Verify parameter values match the expected DataType\n' +
            '   ✓ CRITICAL: If ControlType="MultiInput", Value MUST be an ARRAY (even for single values)\n' +
            '      - ❌ WRONG: {Value: "keyword"} \n' +
            '      - ✅ CORRECT: {Value: ["keyword"]}\n' +
            '      - ✅ CORRECT: {Value: ["keyword1", "keyword2"]}\n' +
            '   ✓ Remember: parameters must exist in BOTH UIParameters and TemplateParameters'
        })
      );
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      validationLog.warn('Could not parse template parameters JSON; skipping strict validation', {
        meta: {
          errorMessage: error.message
        }
      });
      return;
    }
    throw error;
  }
}
