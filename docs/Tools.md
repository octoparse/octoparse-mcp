# Tools

This page describes the public Octoparse MCP tool surface. Tool names and inputs are intended for MCP clients and AI agents; users usually interact with them through natural language prompts.

## `search_templates`

Find an Octoparse template before creating a new cloud task.

Use it when:

- The user knows the target site or data type but not the exact template.
- The agent needs to inspect required parameters before execution.
- The user has a template ID or slug and wants an exact lookup.

Main inputs:

- `keyword`: topic, site, product category, or business use case.
- `id`: exact template ID.
- `slug`: exact template slug or alias.
- `page`: optional page number for keyword search.
- `limit`: optional result limit.

Typical failures or limitations:

- Keyword is too broad or too narrow.
- No matching cloud-capable template is found.
- A matching template is local-only and must be run in the desktop app.

Example prompt:

```text
Find an Octoparse template for scraping Amazon product reviews.
```

## `execute_task`

Validate template inputs, create a cloud task, and start extraction.

Use it when:

- The user has selected a template from `search_templates`.
- The agent has collected required template parameters.
- The user wants to run a new cloud extraction task.

Main inputs:

- `templateName`: template name returned by `search_templates`.
- `parameters`: JSON object string containing template business inputs.
- `taskName`: optional friendly task name.
- `validateOnly`: validate inputs without creating or starting a task.
- `targetMaxRows`: optional best-effort row threshold stop request.

Parameter guidance:

- Use `inputSchema[].field` keys from template lookup.
- For source-backed fields, pass the selected option key.
- Multi-value inputs should be arrays, even when only one value is supplied.

Typical failures or limitations:

- Template cannot run in the cloud.
- Required parameters are missing or invalid.
- Account permissions, quota, or task state prevent execution.
- The client disconnects before capturing follow-up state.

Example prompt:

```text
Run the selected Amazon product listing template for "wireless earbuds" and name the task "Earbuds research".
```

## `export_data`

Export results from an existing task when data is ready.

Use it when:

- `execute_task` returned a task ID.
- The user already has an Octoparse task ID.
- The user wants a preview and download link for collected data.

Main inputs:

- `taskId`: Octoparse task ID.
- `exportFileType`: `JSON`, `CSV`, `EXCEL`, `HTML`, or `XML`.
- `previewRows`: number of preview rows to include, up to the server limit.

Typical statuses:

- `collecting`: task is still running.
- `exporting`: export file is being prepared.
- `exported`: export is ready.
- `no_data`: task completed but has no exportable records.

Typical failures or limitations:

- Task ID is invalid or belongs to another account.
- Task has not finished collecting.
- Export is not ready yet.
- Account does not have access to the task data.

Example prompt:

```text
Export task abc123 as CSV and show me a preview.
```

## `search_tasks`

Search existing tasks in the authenticated Octoparse account.

Use it when:

- The user wants to find a previous task.
- The agent needs a task ID before export or task control.
- The user wants to filter tasks by keyword or status.

Main inputs:

- `keyword`: optional task search text.
- `status`: `Running`, `Stopped`, `Completed`, or `Failed`.
- `taskIds`: explicit task IDs to fetch.
- `page` and `size`: pagination controls.

Typical failures or limitations:

- No tasks match the filters.
- The authenticated account does not have access to the expected task.
- The user selected the wrong workspace or account.

Example prompt:

```text
Find my recent Octoparse tasks related to Amazon.
```

## `start_or_stop_task`

Start or stop an existing cloud task by ID.

Use it when:

- The user already has a task and wants to control it.
- A task is running and should be stopped.
- A stopped cloud-capable task should be started again.

Main inputs:

- `taskId`: existing Octoparse task ID.
- `action`: `start` or `stop`.

Typical failures or limitations:

- Task does not exist or is not accessible.
- Task is already in the requested state.
- Task is local-only or disabled for cloud execution.
- Account permissions or quota prevent the requested action.

Example prompt:

```text
Stop the running task with this task ID.
```

## `redeem_coupon_code`

Redeem a promotion, coupon, or resource code provided by the user.

Use it when:

- The user has received a code from Octoparse.
- The user explicitly asks to redeem that code.

Main input:

- `code`: coupon, promotion, or resource code.

Typical failures or limitations:

- Code is invalid, expired, already used, or unavailable for the account.
- The reward quota or claim limit has been reached.

Example prompt:

```text
Redeem this Octoparse code for my account.
```
