import type { TemplateParameter } from '../api/types.js';
import type { TemplateSourceSchema } from './source-options-resolver.js';

export interface LlmTemplateInputSchemaField {
  field: string;
  label: string;
  type: string;
  required: boolean;
  uiType: string;
  description: string;
  minLen?: number;
  maxLen?: number;
  valueFormat?: string;
  example?: unknown;
  fieldId?: string;
  sourceBacked?: boolean;
  dependsOn?: string;
}

interface TemplateInputFieldEntry {
  field: string;
  label: string;
  fieldId: string;
  paramName?: string;
  sourceBacked: boolean;
  dependsOn?: string;
}

/**
 * Control types that do not collect business input from the user (layout / chrome).
 * Values for these are filled server-side via {@link mergeServerOnlyDefaultsIntoParamMap}.
 */
const CONTROL_TYPES_NO_MODEL_INPUT = new Set(
  [
    'label',
    'textblock',
    'textblock2',
    'separator',
    'seperator',
    'space',
    'paragraph',
    'html',
    'linebreak',
    'blank',
    'divider',
    'line'
  ].map((s) => s.toLowerCase())
);

/**
 * True if the LLM should see this parameter in hints and supply it in `parameters` (ParamName keys).
 * Pure UI/chrome controls are hidden; their Id/Value pairs are still sent to Octoparse after defaulting.
 */
export function isModelVisibleParameter(param: TemplateParameter): boolean {
  const marks = param.marks as Record<string, unknown> | undefined;
  if (marks && (marks.hidden === true || marks.Hidden === true || marks.isHidden === true)) {
    return false;
  }
  const ct = (param.ControlType || '').trim().toLowerCase();
  if (ct && CONTROL_TYPES_NO_MODEL_INPUT.has(ct)) {
    return false;
  }
  return true;
}

function findSourceFieldEntry(
  sourceSchema: TemplateSourceSchema | undefined,
  fieldId: string
): { fieldKey: string; entry: TemplateSourceSchema['fieldKeyMap'][string] } | null {
  if (!sourceSchema) {
    return null;
  }

  for (const [fieldKey, entry] of Object.entries(sourceSchema.fieldKeyMap)) {
    if (entry.fieldId === fieldId) {
      return { fieldKey, entry };
    }
  }

  return null;
}

function hasOwnKey(target: Record<string, unknown>, key: string | undefined): boolean {
  return !!key && Object.prototype.hasOwnProperty.call(target, key);
}

function stripParentheticalSuffix(value: string): string {
  return value.replace(/\s*[\(\[\{（【].*?[\)\]\}）】]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugifyCanonicalField(value: string): string {
  const normalized = stripParentheticalSuffix(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return normalized || 'field';
}

function normalizeInputLabel(param: TemplateParameter): string {
  const marks = param.marks as Record<string, unknown> | undefined;
  const markedDisplayText =
    typeof marks?.paramDisplayText === 'string' ? marks.paramDisplayText.trim() : '';
  const displayText = (param.DisplayText || '').trim();
  const paramName = (param.ParamName || '').trim();

  if (markedDisplayText) {
    return markedDisplayText;
  }

  if (displayText) {
    return displayText;
  }

  if (paramName && paramName.toLowerCase() !== 'null') {
    return paramName;
  }

  return param.Id;
}

function buildTemplateInputFieldEntries(
  templateParams: TemplateParameter[],
  sourceSchema?: TemplateSourceSchema
): TemplateInputFieldEntry[] {
  const entries: TemplateInputFieldEntry[] = [];
  const usedFields = new Map<string, number>();

  for (const param of templateParams.filter(isModelVisibleParameter)) {
    const sourceField = findSourceFieldEntry(sourceSchema, param.Id);
    const label = sourceField?.entry.field || normalizeInputLabel(param);
    const baseField = sourceField?.fieldKey || slugifyCanonicalField(label);
    const collisionCount = (usedFields.get(baseField) || 0) + 1;
    usedFields.set(baseField, collisionCount);
    const field = collisionCount === 1 ? baseField : `${baseField}_${collisionCount}`;

    entries.push({
      field,
      label,
      fieldId: param.Id,
      ...(param.ParamName ? { paramName: param.ParamName } : {}),
      sourceBacked: !!sourceField,
      ...(sourceField?.entry.parentFieldKey
        ? { dependsOn: sourceField.entry.parentFieldKey }
        : {})
    });
  }

  return entries;
}

function findTemplateInputFieldEntry(
  entries: TemplateInputFieldEntry[],
  fieldId: string
): TemplateInputFieldEntry | undefined {
  return entries.find((entry) => entry.fieldId === fieldId);
}

function resolveTemplateFieldInputValue(
  paramMap: Record<string, unknown>,
  entries: TemplateInputFieldEntry[],
  fieldId: string
): unknown {
  const fieldEntry = findTemplateInputFieldEntry(entries, fieldId);
  if (!fieldEntry) {
    return undefined;
  }

  if (hasOwnKey(paramMap, fieldEntry.field)) {
    return paramMap[fieldEntry.field];
  }

  if (hasOwnKey(paramMap, fieldEntry.label)) {
    return paramMap[fieldEntry.label];
  }

  return undefined;
}

function resolveSourceFieldInputValue(
  paramMap: Record<string, unknown>,
  sourceSchema: TemplateSourceSchema | undefined,
  param: TemplateParameter
): unknown {
  const sourceField = findSourceFieldEntry(sourceSchema, param.Id);
  if (!sourceField) {
    return undefined;
  }

  if (hasOwnKey(paramMap, sourceField.fieldKey)) {
    return paramMap[sourceField.fieldKey];
  }

  if (hasOwnKey(paramMap, sourceField.entry.field)) {
    return paramMap[sourceField.entry.field];
  }

  return undefined;
}

function defaultValueForServerOnlyParam(param: TemplateParameter): unknown {
  const opt = param.ControlOptions as Record<string, unknown> | undefined;
  if (opt) {
    if (opt.Default !== undefined) return opt.Default;
    if (opt.default !== undefined) return opt.default;
    if (opt.DefaultValue !== undefined) return opt.DefaultValue;
  }
  const dt = (param.DataType || '').toLowerCase();
  const ct = (param.ControlType || '').toLowerCase();
  if (ct === 'multiinput') {
    return [];
  }
  if (dt === 'int' || dt === 'long' || dt === 'float' || dt === 'double' || dt === 'number') {
    return 0;
  }
  if (dt === 'bool' || dt === 'boolean') {
    return false;
  }
  return '';
}

/**
 * Fills ParamName keys for non–model-visible parameters so UIParameters/TemplateParameters stay paired
 * without exposing those keys to the model.
 */
export function mergeServerOnlyDefaultsIntoParamMap(
  templateParametersJson: string | null | undefined,
  paramMap: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...paramMap };
  if (!templateParametersJson || templateParametersJson.trim() === '') {
    return merged;
  }

  let templateParams: TemplateParameter[];
  try {
    templateParams = JSON.parse(templateParametersJson) as TemplateParameter[];
  } catch {
    return merged;
  }

  if (!Array.isArray(templateParams)) {
    return merged;
  }

  for (const param of templateParams) {
    if (!param.ParamName || !param.Id) {
      continue;
    }
    if (isModelVisibleParameter(param)) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(merged, param.ParamName)) {
      continue;
    }
    merged[param.ParamName] = defaultValueForServerOnlyParam(param);
  }

  return merged;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/** Short Levenshtein distance for fuzzy ParamName matching (keys are short). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
}

/**
 * When the caller key is not an exact/normalized match, try to map it to a template ParamName
 * (e.g. All_the_words vs All_these_words) so search terms are not silently dropped.
 */
function findBestFuzzyParamNameMatch(
  key: string,
  paramsWithName: TemplateParameter[]
): TemplateParameter | undefined {
  const nk = normalizeKey(key);
  if (nk.length < 4) return undefined;

  let best: TemplateParameter | undefined;
  let bestDist = Infinity;

  for (const p of paramsWithName) {
    if (!p.ParamName) continue;
    const pn = normalizeKey(p.ParamName);
    if (pn.length < 4) continue;

    const dist = levenshtein(nk, pn);
    const maxLen = Math.max(nk.length, pn.length);
    const maxAllow = maxLen <= 8 ? 1 : maxLen <= 20 ? 2 : 3;

    if (dist <= maxAllow && dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }

  if (!best || bestDist === Infinity) return undefined;

  const tieBreakers = paramsWithName.filter((p) => {
    if (!p.ParamName) return false;
    return levenshtein(nk, normalizeKey(p.ParamName)) === bestDist;
  });
  if (tieBreakers.length <= 1) return best;

  tieBreakers.sort((a, b) => scoreKeywordCandidate(b) - scoreKeywordCandidate(a));
  return tieBreakers[0];
}

function scoreKeywordCandidate(p: TemplateParameter): number {
  const pn = (p.ParamName || '').toLowerCase();
  const dt = (p.DisplayText || '').toLowerCase();
  const ct = (p.ControlType || '').toLowerCase();
  let s = 0;
  if (/all_these|these_words|allthesewords/.test(pn) || /all_these|these_words/.test(dt)) s += 120;
  if (/\bkeywords?\b|searchkeyword|search_keyword|search_term|search_query/.test(pn)) s += 90;
  if (/keyword|query|search/.test(pn) || /keyword|query|search/.test(dt)) s += 50;
  if (p.IsRequired) s += 35;
  if (ct === 'multiinput') s += 25;
  if (ct === 'text' || ct === 'textarea') s += 10;
  return s;
}

function rankKeywordCandidates(params: TemplateParameter[]): TemplateParameter[] {
  return [...params].sort((a, b) => scoreKeywordCandidate(b) - scoreKeywordCandidate(a));
}

const KEYWORD_ALIASES = new Set([
  'keyword',
  'keywords',
  'kw',
  'query',
  'q',
  'search',
  'searchtext',
  'searchkeyword',
  'keywordtext',
  '关键字',
  '关键词',
  '搜索词',
  '查询词'
]);

function isKeywordLikeParam(param: TemplateParameter): boolean {
  const n = `${param.ParamName || ''} ${param.DisplayText || ''}`.toLowerCase();
  if (/keyword|search|query|key word|关键字|关键词|搜索|查询/.test(n)) return true;
  // Google Ads / broad-match style fields (e.g. All_these_words)
  if (/\bwords\b|_words|terms?\b|phrase|queries?|all_these|these_words/.test(n)) return true;
  return false;
}

/**
 * Aligns caller-provided parameter keys to exact template ParamName keys.
 * Why: LLMs often send `keyword`/`query`/case-variant keys while templates require exact ParamName.
 */
export function alignParamMapToTemplateParamNames(
  templateParametersJson: string | null | undefined,
  paramMap: Record<string, unknown>,
  options?: {
    sourceSchema?: TemplateSourceSchema;
  }
): { alignedParamMap: Record<string, unknown>; mappings: Array<{ from: string; to: string; strategy: string }> } {
  const aligned: Record<string, unknown> = {};
  const mappings: Array<{ from: string; to: string; strategy: string }> = [];

  if (!templateParametersJson || templateParametersJson.trim() === '') {
    return { alignedParamMap: { ...paramMap }, mappings };
  }

  let templateParams: TemplateParameter[];
  try {
    templateParams = JSON.parse(templateParametersJson) as TemplateParameter[];
  } catch {
    return { alignedParamMap: { ...paramMap }, mappings };
  }
  if (!Array.isArray(templateParams) || templateParams.length === 0) {
    return { alignedParamMap: { ...paramMap }, mappings };
  }

  const templateFieldEntries = buildTemplateInputFieldEntries(templateParams, options?.sourceSchema);
  const visibleParams = templateParams.filter((p) => !!p.ParamName && isModelVisibleParameter(p));
  // Name lookups must include hidden ParamNames too: otherwise exact keys like All_these_words
  // are not matched when the template marks the control hidden but still expects ParamName values.
  const allParamsWithName = templateParams.filter((p) => !!p.ParamName);
  const exactNames = new Set(allParamsWithName.map((p) => p.ParamName as string));
  const lowerNameToParam = new Map<string, TemplateParameter>();
  const normalizedNameToParam = new Map<string, TemplateParameter>();
  for (const p of allParamsWithName) {
    lowerNameToParam.set((p.ParamName as string).toLowerCase(), p);
    normalizedNameToParam.set(normalizeKey(p.ParamName as string), p);
  }

  for (const [k, v] of Object.entries(paramMap)) {
    const byField = templateFieldEntries.find(
      (entry) => !entry.sourceBacked && entry.paramName && entry.field === k
    );
    if (byField?.paramName) {
      aligned[byField.paramName] = v;
      mappings.push({ from: k, to: byField.paramName, strategy: 'input_schema_field' });
      continue;
    }

    const byLabel = templateFieldEntries.find(
      (entry) => !entry.sourceBacked && entry.paramName && entry.label.toLowerCase() === k.toLowerCase()
    );
    if (byLabel?.paramName) {
      aligned[byLabel.paramName] = v;
      mappings.push({ from: k, to: byLabel.paramName, strategy: 'input_schema_label' });
      continue;
    }

    if (exactNames.has(k)) {
      aligned[k] = v;
      continue;
    }

    const byLower = lowerNameToParam.get(k.toLowerCase());
    if (byLower) {
      aligned[byLower.ParamName as string] = v;
      mappings.push({ from: k, to: byLower.ParamName as string, strategy: 'case_insensitive' });
      continue;
    }

    const byNormalized = normalizedNameToParam.get(normalizeKey(k));
    if (byNormalized) {
      aligned[byNormalized.ParamName as string] = v;
      mappings.push({ from: k, to: byNormalized.ParamName as string, strategy: 'normalized_key' });
      continue;
    }

    // Semantic fallback: generic keyword-like key -> keyword-like template parameter.
    if (KEYWORD_ALIASES.has(k.toLowerCase())) {
      const keywordCandidates = rankKeywordCandidates(visibleParams.filter(isKeywordLikeParam));
      if (keywordCandidates.length > 0) {
        const preferred = keywordCandidates[0];
        aligned[preferred.ParamName as string] = v;
        mappings.push({ from: k, to: preferred.ParamName as string, strategy: 'keyword_alias' });
        continue;
      }
    }

    const fuzzy = findBestFuzzyParamNameMatch(k, allParamsWithName);
    if (fuzzy?.ParamName) {
      aligned[fuzzy.ParamName] = v;
      mappings.push({ from: k, to: fuzzy.ParamName, strategy: 'fuzzy_param_name' });
      continue;
    }

    // Keep unknown key as-is for transparency; it simply won't be used by builder.
    aligned[k] = v;
  }

  return { alignedParamMap: aligned, mappings };
}

/**
 * Builds Octoparse userInputParameters (UIParameters + TemplateParameters) from a simple
 * ParamName → value map. The MCP server performs pairing; the LLM only supplies business values.
 * Call {@link mergeServerOnlyDefaultsIntoParamMap} first (or use this function which merges internally).
 */
export function buildUserInputParametersFromParamMap(
  templateParametersJson: string | null | undefined,
  paramMap: Record<string, unknown>,
  options?: {
    sourceSchema?: TemplateSourceSchema;
  }
): {
  UIParameters: Array<{ Id: string; Value?: unknown }>;
  TemplateParameters: Array<{ ParamName: string; Value?: unknown }>;
} {
  if (!templateParametersJson || templateParametersJson.trim() === '') {
    return { UIParameters: [], TemplateParameters: [] };
  }

  let templateParams: TemplateParameter[];
  try {
    templateParams = JSON.parse(templateParametersJson) as TemplateParameter[];
  } catch {
    return { UIParameters: [], TemplateParameters: [] };
  }

  if (!Array.isArray(templateParams) || templateParams.length === 0) {
    return { UIParameters: [], TemplateParameters: [] };
  }

  const merged = mergeServerOnlyDefaultsIntoParamMap(templateParametersJson, paramMap);
  const templateFieldEntries = buildTemplateInputFieldEntries(templateParams, options?.sourceSchema);

  const UIParameters: Array<{ Id: string; Value?: unknown }> = [];
  const TemplateParameters: Array<{ ParamName: string; Value?: unknown }> = [];

  for (const param of templateParams) {
    if (!param.Id) {
      continue;
    }

    const templateFieldValue = resolveTemplateFieldInputValue(paramMap, templateFieldEntries, param.Id);
    const sourceFieldValue = resolveSourceFieldInputValue(paramMap, options?.sourceSchema, param);
    const hasParamNameValue =
      !!param.ParamName && Object.prototype.hasOwnProperty.call(merged, param.ParamName);
    const resolvedFieldValue = sourceFieldValue ?? templateFieldValue;
    if (!hasParamNameValue && resolvedFieldValue === undefined) {
      continue;
    }

    const raw = hasParamNameValue ? merged[param.ParamName] : resolvedFieldValue;
    const value = normalizeValueForControl(param.ControlType, raw);

    UIParameters.push({ Id: param.Id, Value: value });
    TemplateParameters.push({ ParamName: param.ParamName || '', Value: value });
  }

  return { UIParameters, TemplateParameters };
}

function normalizeValueForControl(controlType: string | undefined, value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (controlType && controlType.toLowerCase() === 'multiinput') {
    if (value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return [value];
    }
    return [value];
  }

  return value;
}

/**
 * Returns ParamNames that are required by the template but missing from paramMap.
 */
export function findMissingRequiredParamNames(
  templateParametersJson: string | null | undefined,
  paramMap: Record<string, unknown>,
  options?: {
    sourceSchema?: TemplateSourceSchema;
  }
): string[] {
  if (!templateParametersJson || templateParametersJson.trim() === '') {
    return [];
  }

  let templateParams: TemplateParameter[];
  try {
    templateParams = JSON.parse(templateParametersJson) as TemplateParameter[];
  } catch {
    return [];
  }

  if (!Array.isArray(templateParams)) {
    return [];
  }

  const templateFieldEntries = buildTemplateInputFieldEntries(templateParams, options?.sourceSchema);
  const missing: string[] = [];
  for (const param of templateParams) {
    if (!param.IsRequired) {
      continue;
    }
    if (!isModelVisibleParameter(param)) {
      continue;
    }

    const templateField = findTemplateInputFieldEntry(templateFieldEntries, param.Id);
    const hasParamNameValue =
      !!param.ParamName && Object.prototype.hasOwnProperty.call(paramMap, param.ParamName);
    const hasFieldValue =
      !!templateField &&
      (Object.prototype.hasOwnProperty.call(paramMap, templateField.field) ||
        Object.prototype.hasOwnProperty.call(paramMap, templateField.label));

    if (!hasParamNameValue && !hasFieldValue) {
      missing.push(templateField?.field || param.ParamName || param.Id);
    }
  }
  return missing;
}

function normalizeInputFieldType(dataType: string | undefined): string {
  const normalized = (dataType || '').trim().toLowerCase();
  switch (normalized) {
    case 'int':
    case 'integer':
    case 'float':
    case 'double':
    case 'long':
    case 'number':
      return 'number';
    case 'bool':
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'list':
      return 'array';
    default:
      return 'string';
  }
}

function normalizeInputUiType(controlType: string | undefined): string {
  return (controlType || '').trim();
}

function normalizeInputDescription(param: TemplateParameter): string {
  const displayText = (param.DisplayText || '').trim();
  const remark = (param.Remark || '').trim();

  if (displayText && remark) {
    return `${displayText} (Instruction: ${remark})`;
  }

  return displayText || remark || '';
}

/**
 * Converts Octoparse template parameters into a smaller LLM-facing input schema.
 * This mirrors TemplateParameter but only keeps model-relevant fields.
 */
export function buildInputSchemaForLlm(
  templateParametersJson: string | null | undefined,
  options?: {
    sourceSchema?: TemplateSourceSchema;
  }
): LlmTemplateInputSchemaField[] {
  if (!templateParametersJson || templateParametersJson.trim() === '') {
    return [];
  }

  let templateParams: TemplateParameter[];
  try {
    templateParams = JSON.parse(templateParametersJson) as TemplateParameter[];
  } catch {
    return [];
  }

  if (!Array.isArray(templateParams)) {
    return [];
  }

  const templateFieldEntries = buildTemplateInputFieldEntries(templateParams, options?.sourceSchema);

  return templateParams.filter(isModelVisibleParameter).map((param) => {
    const dataTypeOptions = param.DataTypeOptions || {};
    const minLen = dataTypeOptions.MinLen ?? (param.IsRequired ? 1 : 0);
    const maxLen = dataTypeOptions.MaxLen ?? 999999;
    const fieldEntry = findTemplateInputFieldEntry(templateFieldEntries, param.Id);

    return {
      field: fieldEntry?.field || slugifyCanonicalField(normalizeInputLabel(param)),
      label: fieldEntry?.label || normalizeInputLabel(param),
      type: normalizeInputFieldType(param.DataType),
      required: !!param.IsRequired,
      uiType: normalizeInputUiType(param.ControlType),
      description: normalizeInputDescription(param),
      minLen,
      maxLen,
      ...((param.ControlType || '').toLowerCase() === 'multiinput'
        ? {
            valueFormat: 'string[]',
            example: ['keyword1', 'keyword2']
          }
        : {}),
      ...(fieldEntry?.fieldId
        ? {
          fieldId: fieldEntry.fieldId,
          ...(fieldEntry.sourceBacked ? { sourceBacked: true } : {}),
          ...(fieldEntry.dependsOn
            ? { dependsOn: fieldEntry.dependsOn }
            : {})
        }
        : {})
    };
  });
}

/** True if the caller supplied a non-empty value worth treating as intentional input. */
export function isMeaningfulParameterValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}
