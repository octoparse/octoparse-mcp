/**
 * Stable, machine-readable hints for the core 3-step Octoparse MCP scrape workflow.
 */

export const DEFAULT_TEMPLATE_SEARCH_LIMIT = 10;

export const SEARCH_WORKFLOW_HINT = {
  /** Fixed scrape pipeline for this MCP server */
  pipeline: ['search_templates', 'execute_task', '(tasks/get|tasks/result) or export_data', 'export_data'] as const,
  routeToSearchWhen:
    'If the user asks to scrape, crawl, extract, collect, or get website data, start with search_templates.',
  templateChainingRule:
    'If a template row includes outputSchema, treat it as the structured fields this template can collect. Those collected fields can be used as candidate inputs for a later template, so outputSchema is useful for chaining templates into multi-step scraping workflows.',
  executeTaskParameters:
    'Pass parameters as a JSON object string using inputSchema[].field as the key contract, for example `"{\\"search_keyword\\":[\\"phone\\"],\\"site\\":\\"United States\\"}"`. The server validates that it parses to a JSON object before execution. For source-backed fields, pass the selected source option key as the field value. MultiInput fields must be string[] even for a single value. Use validateOnly=true before creating a task; validateOnly may return status=awaiting_source_selection until dependent source-backed fields are chosen. For non-validateOnly runs, MCP Tasks mode is the recommended first choice whenever the client supports task augmentation; direct calls are compatibility fallback only for clients with limited MCP task support. For MCP task clients, follow runtime state through tasks/get or tasks/result. For clients without MCP Tasks, execute_task returns accepted with an Octoparse taskId right after create/start succeeds; then wait about 10-30 seconds before calling export_data(taskId) to begin polling collection/export progress. A positive targetMaxRows requires MCP task mode. targetMaxRows=0 means no threshold stop.',
  sourceOptionsRule:
    'Keyword search returns source summaries only. Use exact lookup to inspect root-level sourceOptions. If a field depends on another field, use execute_task(validateOnly=true) with the selected parent value to resolve dependent sourceOptions.',
  exportDataPreviewRule:
    'export_data is the post-completion export tool. It may still return collecting for direct Octoparse taskIds, but execute_task follow-up should prefer tasks/get and tasks/result until execution is done. If export_data returns collecting or exporting, wait 10-30 seconds before retrying. If sampleData is returned, always present it as a table in the reply, regardless of exportFileType (including JSON). Default preview is 5 rows unless previewRows is overridden. Always show exportFileUrl when it is present. Do not download or parse exportFileUrl to extract preview data unless the user explicitly asks for file-based extraction.'
} as const;

/** Readable doc for MCP resource `octoparse://workflow` (same semantics as `workflowHint` on search_templates). */
export function formatWorkflowResourceMarkdown(): string {
  return [
    '# Octoparse MCP — Core workflow',
    '',
    '## Tool order',
    '',
    SEARCH_WORKFLOW_HINT.pipeline.join(' → '),
    '',
    '## Intent routing (default first tool)',
    '',
    `- ${SEARCH_WORKFLOW_HINT.routeToSearchWhen}`,
    '- Do not call `execute_task` directly unless you already have a valid `templateName` and business parameters.',
    '- Do not call `export_data` first unless user already provides an existing Octoparse `taskId` or the execution task is already complete.',
    '',
    '## Template chaining',
    '',
    SEARCH_WORKFLOW_HINT.templateChainingRule,
    '',
    '## execute_task parameters',
    '',
    SEARCH_WORKFLOW_HINT.executeTaskParameters,
    '',
    '## sourceOptions',
    '',
    SEARCH_WORKFLOW_HINT.sourceOptionsRule,
    '',
    '## validateOnly',
    '',
    '- Set `validateOnly=true` on `execute_task` to validate `templateName` + parameters and get `normalizedParametersPreview` without creating a task.',
    '- `validateOnly` now returns readiness fields: `status`, `canExecuteNow`, `blockingIssues`, and `nextAction`.',
    '- `status="awaiting_source_selection"` means validation succeeded so far, but dependent source-backed fields still need option keys before execution can start.',
    '- If the template has dependent source-backed fields, validateOnly can also return next-level sourceOptions for the current selections.',
    '',
    '## Tasks / export',
    '',
    '- **execute_task** supports both synchronous validateOnly preflight and optional MCP task execution. For non-`validateOnly` runs, MCP Tasks mode is the recommended first choice whenever the client supports task augmentation. Direct calls are compatibility fallback only. For MCP task clients, use **tasks/get** for runtime status and **tasks/result** for the final execution payload.',
    '- For non-task clients, **execute_task** returns `accepted` after create/start succeeds. Wait about 10-30 seconds, then follow up with **export_data(taskId)** instead of waiting for final completion in the same request.',
    '- `targetMaxRows` only changes runtime behavior when it is a positive integer and the request uses MCP task mode. `targetMaxRows=0` means no threshold stop.',
    '- Only move to **export_data** after the MCP task reaches a terminal success state or when the user already has a direct Octoparse taskId.',
    '- By default **export_data** returns up to 5 preview rows; pass `previewRows` to override this.',
    '- If **export_data** returns `collecting` or `exporting`, retry in about 10-30 seconds.',
    `- ${SEARCH_WORKFLOW_HINT.exportDataPreviewRule}`,
    ''
  ].join('\n');
}

/**
 * Shorten Octoparse templateMapping validation errors for LLM consumption.
 * Original messages often mention UIParameters/TemplateParameters and internal API names.
 */
export function sanitizeTemplateTaskCreationError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Task creation was rejected by Octoparse.';
  }
  const looksInternal =
    /UIParameters|TemplateParameters|getTemplateView|ValidateTemplateParameters|templateMapping/i.test(
      trimmed
    );
  if (!looksInternal) {
    return trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}…` : trimmed;
  }
  const stripped = trimmed
    .replace(/💡[\s\S]*$/m, '')
    .replace(/📦[\s\S]*$/m, '')
    .trim();
  const short = stripped.length > 500 ? `${stripped.slice(0, 500)}…` : stripped;
  return (
    `${short}\n\n` +
    `MCP: Use execute_task with "parameters" as a JSON object string. ` +
    `The server builds UI/Template parameter arrays. Match parameter keys to inputSchema.field; MultiInput = string array; use exact-lookup root sourceOptions and validateOnly dependent sourceOptions before running.`
  );
}
