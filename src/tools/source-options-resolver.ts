import type { TemplateParameter } from '../api/types.js';

export interface SourceOption {
  key: string;
  label: string;
}

export interface SourceFieldKeyEntry {
  field: string;
  fieldId: string;
  paramName?: string;
  parentFieldKey?: string;
}

export interface TemplateSourceSchema {
  templateId: number;
  versionId: number;
  acceptLanguage: string;
  fieldKeyMap: Record<string, SourceFieldKeyEntry>;
  rootFieldOptions: Record<string, SourceOption[]>;
  dependencyOptionIndex: Record<string, Record<string, SourceOption[]>>;
}

export interface DependentSourceResolution {
  sourceOptions: Record<string, SourceOption[]>;
  awaitingDependency: Array<{
    fieldKey: string;
    dependsOn: string;
  }>;
  invalidSelections: Array<{
    fieldKey: string;
    selectedKey: string;
    allowedKeys: string[];
  }>;
}

interface ParsedXmlNode {
  name: string;
  attributes: Record<string, string>;
  children: ParsedXmlNode[];
  parent?: ParsedXmlNode;
}

interface SourceBackedField {
  fieldId: string;
  field: string;
  fieldKey: string;
  paramName: string;
  controlType: string;
  sourceName: string;
  filter: string;
  parentFieldId?: string;
  parentFieldKey?: string;
}

interface BuildTemplateSourceSchemaInput {
  templateId: number;
  versionId: number;
  acceptLanguage: string;
  parametersJson?: string | null;
  fieldDataSource?: string | null;
}

export interface BuildSourceSummaryResult {
  hasSourceOptions: boolean;
  hasDependentSourceOptions: boolean;
  sourceFieldCount: number;
  rootSourceFieldCount: number;
  dependentSourceFieldCount: number;
  rootOptionCount: number;
  sourceFields: Array<{
    field: string;
    label: string;
    fieldId: string;
    level: 'root' | 'dependent';
    dependsOn?: string;
    rootOptionCount?: number;
  }>;
}

function parseTemplateParameters(parametersJson?: string | null): TemplateParameter[] {
  if (!parametersJson || parametersJson.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(parametersJson) as TemplateParameter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseFieldDataSourceMap(fieldDataSource?: string | null): Record<string, string> {
  if (!fieldDataSource || fieldDataSource.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(fieldDataSource) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

function isSourceBackedField(param: TemplateParameter): boolean {
  const controlOptions = param.ControlOptions as Record<string, unknown> | undefined;
  return (
    controlOptions?.DataSourceType === 'External' &&
    typeof controlOptions.DataSource === 'string' &&
    controlOptions.DataSource.trim() !== '' &&
    typeof controlOptions.DataSourceFilter === 'string' &&
    controlOptions.DataSourceFilter.trim() !== ''
  );
}

function normalizeInputField(param: TemplateParameter): string {
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

function slugifyFieldKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return normalized || 'field';
}

function buildSourceBackedFields(templateParams: TemplateParameter[]): SourceBackedField[] {
  const usedFieldKeys = new Map<string, number>();
  const byId = new Map<string, SourceBackedField>();
  const fields: SourceBackedField[] = [];

  for (const param of templateParams) {
    if (!isSourceBackedField(param)) {
      continue;
    }

    const controlOptions = param.ControlOptions as Record<string, unknown>;
    const baseFieldKey = slugifyFieldKey(normalizeInputField(param));
    const collisionCount = (usedFieldKeys.get(baseFieldKey) || 0) + 1;
    usedFieldKeys.set(baseFieldKey, collisionCount);
    const fieldKey = collisionCount === 1 ? baseFieldKey : `${baseFieldKey}_${collisionCount}`;
    const parentFieldId =
      typeof controlOptions.ParentField === 'string' && controlOptions.ParentField.trim() !== ''
        ? controlOptions.ParentField.trim()
        : undefined;

    const field: SourceBackedField = {
      fieldId: param.Id,
      field: normalizeInputField(param),
      fieldKey,
      paramName: param.ParamName || '',
      controlType: param.ControlType || '',
      sourceName: String(controlOptions.DataSource).trim(),
      filter: String(controlOptions.DataSourceFilter).trim(),
      ...(parentFieldId ? { parentFieldId } : {})
    };

    byId.set(field.fieldId, field);
    fields.push(field);
  }

  for (const field of fields) {
    if (!field.parentFieldId) {
      continue;
    }
    const parent = byId.get(field.parentFieldId);
    if (parent) {
      field.parentFieldKey = parent.fieldKey;
    }
  }

  return fields;
}

function decodeXmlEntity(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(['"])(.*?)\2/g;
  let match: RegExpExecArray | null = attrRegex.exec(raw);
  while (match) {
    attributes[match[1]] = decodeXmlEntity(match[3]);
    match = attrRegex.exec(raw);
  }
  return attributes;
}

function parseXml(xml: string): ParsedXmlNode | null {
  const tagRegex = /<\s*(\/?)\s*([A-Za-z_][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  const stack: ParsedXmlNode[] = [];
  let root: ParsedXmlNode | null = null;
  let match: RegExpExecArray | null = tagRegex.exec(xml);

  while (match) {
    const [, closingSlash, tagName, rawAttributes, explicitSelfClosing] = match;
    const isClosing = closingSlash === '/';
    const isSelfClosing = explicitSelfClosing === '/' || rawAttributes.trim().endsWith('/');

    if (isClosing) {
      while (stack.length > 0) {
        const candidate = stack.pop();
        if (candidate?.name === tagName) {
          break;
        }
      }
      match = tagRegex.exec(xml);
      continue;
    }

    const node: ParsedXmlNode = {
      name: tagName,
      attributes: parseAttributes(rawAttributes),
      children: []
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else if (!root) {
      root = node;
    }

    if (!isSelfClosing) {
      stack.push(node);
    }

    match = tagRegex.exec(xml);
  }

  return root;
}

function parsePathSegments(filter: string): string[] {
  return filter
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function selectChildPath(node: ParsedXmlNode, segments: string[]): ParsedXmlNode[] {
  if (segments.length === 0) {
    return [node];
  }

  let currentLevel = [node];
  for (const segment of segments) {
    const nextLevel: ParsedXmlNode[] = [];
    for (const current of currentLevel) {
      nextLevel.push(...current.children.filter((child) => child.name === segment));
    }
    currentLevel = nextLevel;
    if (currentLevel.length === 0) {
      break;
    }
  }

  return currentLevel;
}

function findNodesByPathAnywhere(node: ParsedXmlNode, segments: string[]): ParsedXmlNode[] {
  if (segments.length === 0) {
    return [];
  }

  const [first, ...rest] = segments;
  const matches: ParsedXmlNode[] = [];

  if (node.name === first) {
    if (rest.length === 0) {
      matches.push(node);
    } else {
      matches.push(...selectChildPath(node, rest));
    }
  }

  for (const child of node.children) {
    matches.push(...findNodesByPathAnywhere(child, segments));
  }

  return matches;
}

function selectDocumentNodes(root: ParsedXmlNode, filter: string): ParsedXmlNode[] {
  const trimmed = filter.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('//')) {
    return findNodesByPathAnywhere(root, parsePathSegments(trimmed.slice(2)));
  }

  if (trimmed.startsWith('/')) {
    const segments = parsePathSegments(trimmed.slice(1));
    if (segments.length > 0 && segments[0] === root.name) {
      return selectChildPath(root, segments.slice(1));
    }
    return selectChildPath(root, segments);
  }

  return selectChildPath(root, parsePathSegments(trimmed));
}

function selectRelativeNodes(parentNode: ParsedXmlNode, filter: string): ParsedXmlNode[] {
  const trimmed = filter.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('//')) {
    return findNodesByPathAnywhere(parentNode, parsePathSegments(trimmed.slice(2)));
  }

  const normalized = trimmed.replace(/^\/+/, '');
  return selectChildPath(parentNode, parsePathSegments(normalized));
}

function mapNodeToOption(node: ParsedXmlNode): SourceOption | null {
  const keyCandidates = [
    node.attributes.value,
    node.attributes.key,
    node.attributes.id,
    node.attributes.name
  ];
  const labelCandidates = [
    node.attributes.name,
    node.attributes.label,
    node.attributes.text,
    node.attributes.value
  ];

  const key = keyCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim() !== '');
  const label = labelCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim() !== '');

  if (!key || !label) {
    return null;
  }

  return {
    key: key.trim(),
    label: label.trim()
  };
}

function dedupeOptions(options: SourceOption[]): SourceOption[] {
  const seen = new Set<string>();
  const deduped: SourceOption[] = [];

  for (const option of options) {
    const signature = `${option.key}:::${option.label}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    deduped.push(option);
  }

  return deduped;
}

function dedupeOptionsByKey(options: SourceOption[]): SourceOption[] {
  const seen = new Set<string>();
  const deduped: SourceOption[] = [];

  for (const option of options) {
    if (seen.has(option.key)) {
      continue;
    }
    seen.add(option.key);
    deduped.push(option);
  }

  return deduped;
}

function buildFieldKeyMap(fields: SourceBackedField[]): Record<string, SourceFieldKeyEntry> {
  return Object.fromEntries(
    fields.map((field) => [
      field.fieldKey,
      {
        field: field.field,
        fieldId: field.fieldId,
        ...(field.paramName ? { paramName: field.paramName } : {}),
        ...(field.parentFieldKey ? { parentFieldKey: field.parentFieldKey } : {})
      }
    ])
  );
}

export function buildTemplateSourceSchema(
  input: BuildTemplateSourceSchemaInput
): TemplateSourceSchema {
  const templateParams = parseTemplateParameters(input.parametersJson);
  const fields = buildSourceBackedFields(templateParams);
  const fieldDataSources = parseFieldDataSourceMap(input.fieldDataSource);
  const fieldKeyMap = buildFieldKeyMap(fields);
  const rootFieldOptions: Record<string, SourceOption[]> = {};
  const dependencyOptionIndex: Record<string, Record<string, SourceOption[]>> = {};
  const xmlRootBySourceName = new Map<string, ParsedXmlNode | null>();
  const rawNodesByFieldId = new Map<string, ParsedXmlNode[]>();

  for (const field of fields.filter((candidate) => !candidate.parentFieldId)) {
    const xml = fieldDataSources[field.sourceName];
    if (!xml) {
      continue;
    }

    if (!xmlRootBySourceName.has(field.sourceName)) {
      xmlRootBySourceName.set(field.sourceName, parseXml(xml));
    }

    const xmlRoot = xmlRootBySourceName.get(field.sourceName);
    if (!xmlRoot) {
      continue;
    }

    const rawNodes = selectDocumentNodes(xmlRoot, field.filter);
    rawNodesByFieldId.set(field.fieldId, rawNodes);
    rootFieldOptions[field.fieldKey] = dedupeOptionsByKey(
      rawNodes
        .map((node) => mapNodeToOption(node))
        .filter((option): option is SourceOption => option !== null)
    );
  }

  const pendingChildren = fields.filter((candidate) => !!candidate.parentFieldId);
  const maxPasses = pendingChildren.length + 1;
  let passes = 0;

  while (pendingChildren.length > 0 && passes < maxPasses) {
    passes += 1;

    for (let index = pendingChildren.length - 1; index >= 0; index -= 1) {
      const field = pendingChildren[index];
      if (!field.parentFieldId) {
        pendingChildren.splice(index, 1);
        continue;
      }

      const parentNodes = rawNodesByFieldId.get(field.parentFieldId);
      if (!parentNodes) {
        continue;
      }

      const dependencyIndex: Record<string, SourceOption[]> = {};
      const rawNodes: ParsedXmlNode[] = [];

      for (const parentNode of parentNodes) {
        const parentOption = mapNodeToOption(parentNode);
        if (!parentOption) {
          continue;
        }

        const childNodes = selectRelativeNodes(parentNode, field.filter);
        rawNodes.push(...childNodes);

        const childOptions = dedupeOptions(
          childNodes
            .map((node) => mapNodeToOption(node))
            .filter((option): option is SourceOption => option !== null)
        );

        if (childOptions.length === 0) {
          continue;
        }

        const existing = dependencyIndex[parentOption.key] || [];
        dependencyIndex[parentOption.key] = dedupeOptions([...existing, ...childOptions]);
      }

      rawNodesByFieldId.set(field.fieldId, rawNodes);
      dependencyOptionIndex[field.fieldKey] = dependencyIndex;
      pendingChildren.splice(index, 1);
    }
  }

  return {
    templateId: input.templateId,
    versionId: input.versionId,
    acceptLanguage: input.acceptLanguage,
    fieldKeyMap,
    rootFieldOptions,
    dependencyOptionIndex
  };
}

export function buildSourceSummary(schema: TemplateSourceSchema): BuildSourceSummaryResult {
  const rootFieldKeys = Object.keys(schema.rootFieldOptions);
  const dependentFieldKeys = Object.keys(schema.dependencyOptionIndex);
  const sourceFields = Object.entries(schema.fieldKeyMap).map(([fieldKey, entry]) => ({
    field: fieldKey,
    label: entry.field,
    fieldId: entry.fieldId,
    level: entry.parentFieldKey ? ('dependent' as const) : ('root' as const),
    ...(entry.parentFieldKey ? { dependsOn: entry.parentFieldKey } : {}),
    ...(schema.rootFieldOptions[fieldKey]
      ? { rootOptionCount: schema.rootFieldOptions[fieldKey].length }
      : {})
  }));

  return {
    hasSourceOptions: sourceFields.length > 0,
    hasDependentSourceOptions: dependentFieldKeys.length > 0,
    sourceFieldCount: sourceFields.length,
    rootSourceFieldCount: rootFieldKeys.length,
    dependentSourceFieldCount: dependentFieldKeys.length,
    rootOptionCount: rootFieldKeys.reduce(
      (total, fieldKey) => total + (schema.rootFieldOptions[fieldKey]?.length || 0),
      0
    ),
    sourceFields
  };
}

export function resolveDependentSourceOptions(
  schema: TemplateSourceSchema,
  selectedFieldValues: Record<string, unknown>
): DependentSourceResolution {
  const sourceOptions: Record<string, SourceOption[]> = {};
  const awaitingDependency: DependentSourceResolution['awaitingDependency'] = [];
  const invalidSelections: DependentSourceResolution['invalidSelections'] = [];

  for (const [fieldKey, entry] of Object.entries(schema.fieldKeyMap)) {
    if (!entry.parentFieldKey) {
      continue;
    }

    const parentFieldKey = entry.parentFieldKey;
    const parentRawValue = selectedFieldValues[parentFieldKey];
    const dependencyIndex = schema.dependencyOptionIndex[fieldKey] || {};

    if (typeof parentRawValue !== 'string' || parentRawValue.trim() === '') {
      awaitingDependency.push({
        fieldKey,
        dependsOn: parentFieldKey
      });
      continue;
    }

    const selectedKey = parentRawValue.trim();
    const options = dependencyIndex[selectedKey];
    if (!options) {
      invalidSelections.push({
        fieldKey: parentFieldKey,
        selectedKey,
        allowedKeys: (schema.rootFieldOptions[parentFieldKey] || []).map((option) => option.key)
      });
      continue;
    }

    sourceOptions[fieldKey] = options;
  }

  return {
    sourceOptions,
    awaitingDependency,
    invalidSelections
  };
}
