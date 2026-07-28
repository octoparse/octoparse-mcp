const lines = (...segments: string[]) => segments.join('\n');

const messages = {
  errors: {
    task: {
      start: {
        noPermission:
          'You do not have permission to start this task. Only template tasks can use the trial quota. Please upgrade to Team or Enterprise.'
      }
    },
    selfCorrection: {
      cloudTaskPermissionDenied: {
        title: 'Error: Account does not have permission to run cloud collection tasks.',
        body: {
          rootCause:
            'Your current account level is {currentAccountLevel} ({currentLevelName}), which does not have permission to execute cloud collection tasks.',
          requiredLevels:
            'Cloud task execution requires one of the following account levels: {allowedLevelNames}.'
        },
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          '{rootCause}',
          '',
          '{requiredLevels}',
          '',
          '[Why This Restriction Exists]:',
          'Cloud collection tasks consume Octoparse cloud resources, so access is limited by account level.',
          '',
          '[What You Should Tell The User]:',
          '"Your {currentLevelName} account cannot run cloud collection tasks right now. You can start a free trial, upgrade your plan, or use the desktop app for local execution."',
          '',
          '[Action Options]:',
          '1. Free trial: {trialUrl}',
          '2. Upgrade plan: {upgradeUrl}',
          '3. Desktop download: {downloadUrl}',
          '',
          '[Technical Details]:',
          '- Current Account Level: {currentAccountLevel} ({currentLevelName})',
          '- Required Levels: {allowedAccountLevels} ({allowedLevelNames})',
          '- Trial URL: {trialUrl}',
          '- Upgrade URL: {upgradeUrl}',
          '- Download URL: {downloadUrl}',
          '',
          '[DO NOT]:',
          '- Do NOT attempt to start cloud tasks until the user upgrades or activates trial.',
          '- Do NOT suggest unsupported workarounds.',
          '- Do NOT say "check permissions" without giving the next action.'
        )
      },
      taskAlreadyRunning: {
        title: 'Error: Task is already running.',
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          'Task "{taskId}"{taskNameSuffix} is currently executing on cloud servers.',
          'A task cannot be started while it is already running.',
          '',
          '[What You Should Tell The User]:',
          '"This task is already running. You can check progress, stop and restart it, or keep monitoring it."',
          '',
          '[Recovery Steps]:',
          '1. Check progress or preview data with `export_data(taskId: "{taskId}")`.',
          '2. Stop the current run with `start_or_stop_task(taskId: "{taskId}", action: "stop")` if the user wants a restart.',
          '3. Use `execute_task` only when the user wants a brand-new task from a template.',
          '',
          '[Technical Details]:',
          '- Task ID: {taskId}',
          '{taskNameDetail}',
          '- Current Status: Running',
          '',
          '[DO NOT]:',
          '- Do NOT try to start the task again without stopping it first.',
          '- Do NOT assume the user wants a restart.'
        )
      },
      taskNotRunning: {
        title: 'Error: Task is not currently running.',
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          'Task "{taskId}"{taskNameSuffix} is not currently executing.',
          '{statusLine}',
          'You cannot stop a task that is not running.',
          '',
          '[What You Should Tell The User]:',
          '"This task is not currently running. You can start it, inspect its current status, or export data if it already finished."',
          '',
          '[Recovery Steps]:',
          '1. Start the existing task with `start_or_stop_task(taskId: "{taskId}", action: "start")`.',
          '2. Use `export_data(taskId: "{taskId}")` if the task may already have finished.',
          '3. Use `search_templates` if the user needs a different template.',
          '',
          '[Technical Details]:',
          '- Task ID: {taskId}',
          '{taskNameDetail}',
          '{currentStatusDetail}',
          '',
          '[DO NOT]:',
          '- Do NOT say the task was stopped successfully.',
          '- Do NOT retry stop on the same non-running task.'
        )
      },
      insufficientCredits: {
        title: 'Error: Insufficient credits to start task.',
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          'The account does not have enough credits to execute this task.',
          '{currentBalanceLine}',
          '{estimatedCostLine}',
          '',
          '[User Action Required]:',
          'The user needs to add credits or upgrade before running the task.',
          '',
          '[What You Should Tell The User]:',
          '"Your account does not have enough credits to run this task. Please top up your balance or upgrade your plan before trying again."',
          '',
          '[Technical Details]:',
          '{taskIdDetail}',
          '{currentBalanceDetail}',
          '{estimatedCostDetail}',
          '',
          '[DO NOT]:',
          '- Do NOT retry the same start request until the account has enough credits.',
          '- Do NOT suggest unsupported workarounds.'
        )
      },
      taskNoData: {
        title: 'Error: No data available to export.',
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          'Task "{taskId}"{taskNameSuffix} does not have exportable data available right now.',
          '{hasRunBeforeExplanation}',
          '',
          '[What You Should Tell The User]:',
          '{userMessage}',
          '',
          '[Recovery Steps]:',
          '{recoverySteps}',
          '',
          '[Technical Details]:',
          '- Task ID: {taskId}',
          '{taskNameDetail}',
          '- Has Run Before: {hasRunBeforeLabel}',
          '',
          '[DO NOT]:',
          '- Do NOT say export failed without explaining there is no new data.',
          '- Do NOT retry export until the task collects new data.'
        )
      },
      templateLocalOnly: {
        title: 'Error: Cannot start task on cloud.',
        body: {
          taskLabel: '[Task]:',
          rootCause:
            'This task uses template ID {templateId} ("{templateName}"), which has runOn=1 (Local Only).',
          executionConstraint:
            'Templates with runOn=1 can only execute on the user\'s local computer using the Octoparse desktop application.'
        },
        template: lines(
          '{title}',
          '',
          '{taskLabel}',
          '"{taskId}"',
          '',
          '[Root Cause]:',
          '{rootCause}',
          '{executionConstraint}',
          'Cloud execution is not supported for this template.',
          '',
          '[What You Should Tell The User]:',
          '"This task uses a local-only template. Use the desktop app for local execution, or choose a different cloud-compatible template."',
          '',
          '[Recovery Steps]:',
          '1. Search cloud-compatible alternatives with `search_templates(keyword: "{websiteHint}")`.',
          '2. Prefer `recommendedTemplateName`; otherwise choose a template whose `executionMode` includes "Cloud".',
          '3. Use `execute_task` with the selected cloud template.',
          '',
          '[Technical Details]:',
          '- Task ID: {taskId}',
          '- Template ID: {templateId}',
          '- Template Name: {templateName}',
          '- Template runOn: 1 (Local Only)',
          '{accountLimitDetail}',
          '',
          '[DO NOT]:',
          '- Do NOT try to start the same local-only template on cloud again.',
          '- Do NOT suggest changing the template execution mode for the task.'
        )
      },
      dataExportFailed: {
        title: 'Error: Failed to export task data via API.',
        template: lines(
          '{title}',
          '',
          '[Root Cause]:',
          'The MCP server could not export data from task "{taskId}"{taskNameSuffix}.',
          'Error details: {errorMessage}',
          '',
          '[What You Should Tell The User]:',
          '"API export failed, but the task data is still available in the Octoparse console. Use the console page below to view or download it."',
          '',
          '[Fallback Option]:',
          '- Console URL: {consoleUrl}',
          '',
          '[Technical Details]:',
          '- Task ID: {taskId}',
          '{taskNameDetail}',
          '- Console URL: {consoleUrl}',
          '- Error: {errorMessage}',
          '',
          '[DO NOT]:',
          '- Do NOT say the data is lost.',
          '- Do NOT promise immediate API export success on retry.'
        )
      },
      parameterValidationFailed: {
        title: 'Error: Parameter validation failed.',
        template: lines(
          '{title}',
          '',
          '[Parameter]:',
          '"{parameterName}"',
          '',
          '[Root Cause]:',
          'The provided value does not match the expected format{toolSuffix}.',
          'Provided: {providedValuePretty}',
          'Expected Format: {expectedFormat}',
          '',
          '[How To Fix]:',
          '1. Reconstruct the parameter using the expected format.',
          '2. Compare it with this example: {example}',
          '3. Ask the user for clarification if the correct value is still unclear.',
          '',
          '[Technical Details]:',
          '- Parameter: {parameterName}',
          '{toolDetail}',
          '- Provided: {providedValueCompact}',
          '- Expected: {expectedFormat}',
          '- Example: {example}',
          '',
          '[DO NOT]:',
          '- Do NOT retry with the same invalid value.',
          '- Do NOT fabricate parameter values.'
        )
      },
      generic: {
        title: 'Error during operation.',
        template: lines(
          '{title}',
          '',
          '[Operation]:',
          '{operation}',
          '',
          '[Error Message]:',
          '{errorMessage}',
          '',
          '[Recovery Suggestion]:',
          '{recoverySuggestion}',
          '',
          '[What You Should Tell The User]:',
          '"I encountered an error while {operation}. {recoverySuggestion}"'
        )
      }
    }
  },
  tools: {
    startOrStopTask: {
      title: 'Start Or Stop Task',
      description:
        'Start or stop an existing Octoparse task by taskId. Use action=`start` or `stop`.'
    },
    searchTasks: {
      title: 'Search Tasks',
      description:
        'Search the current user\'s existing Octoparse tasks. Use this to find a taskId before export_data or start_or_stop_task. Supports pagination, keyword, status, and explicit taskIds. When UI rows are shown, respond with a concise summary instead of repeating the full list.',
      actionPromptTemplates: {
        start: 'Try to start or restart task {taskId}.',
        stop: 'Try to stop task {taskId}.'
      }
    },
    searchTemplates: {
      title: 'Search Templates',
      description:
        'Find the right Octoparse template before `execute_task`. Use exactly one selector: `keyword` for discovery, `id` for exact template id, or `slug` for exact alias. Keyword mode returns `recommendedTemplateName`, normalized `templates[]`, and lightweight source summaries; each template includes `templateName` and AI-facing `executionMode` such as "Cloud", "Local only", or "Cloud and local". Exact lookup returns a single `template` with full `inputSchema`; if the template has source-backed fields, exact lookup may also return root-level `sourceOptions`. When present, `outputSchema` describes the fields this template can collect and can be used for chained workflows. Prefer `recommendedTemplateName` or templates whose `executionMode` includes "Cloud"; local-only results include desktop guidance.',
      useTemplatePromptTemplate: 'I want to use the [{templateName}] template to run a collection. Please help me prepare the required parameters.'
    },
    exportData: {
      title: 'Export Data',
      description:
        'Export data for an existing Octoparse `taskId` after execution is complete. This tool may still return `collecting`, `exporting`, `exported`, or `no_data`, but when the task came from `execute_task`, prefer MCP `tasks/get` and `tasks/result` for runtime follow-up until the execution task is done. If status is `collecting` or `exporting`, wait 10-30 seconds and call `export_data` again. By default it returns up to 5 preview rows. If `sampleData` is present, present it as a table regardless of `exportFileType` (including `JSON`) and use it as the default preview source. Do not download or parse `exportFileUrl` unless the user explicitly asks for file-based extraction. Always show `exportFileUrl` when it is present. Accepts `exportFileType` as a string enum.'
    },
    executeTask: {
      title: 'Validate Or Start A Cloud Task',
      description:
        'Use this tool in two modes: `validateOnly=true` performs a synchronous preflight check for `templateName` + parameters without creating a task, while normal execution creates and starts an Octoparse cloud task. Prefer setting `taskName` so the same run can be recovered safely if the client disconnects before capturing the task id. Validate-only responses include `status`, `canExecuteNow`, `blockingIssues`, and `nextAction`, so success can still mean "not ready to execute yet".\n\nFor non-`validateOnly` runs, MCP Tasks mode is the recommended first choice whenever the client supports task augmentation. For MCP task clients, call `execute_task` with task augmentation and follow runtime state through `tasks/get` and `tasks/result`. Direct calls are compatibility fallback only for clients with limited MCP task support. In that fallback path, `execute_task` returns `accepted` with an Octoparse `taskId` right after create/start succeeds; then wait about 10-30 seconds before calling `export_data(taskId)` to start polling for collection and export progress instead of waiting for final completion in the same request. Legacy alias `slug` is still accepted.\n\n`parameters` is a JSON object string for MCP clients that cannot send object-typed arguments, for example `"{\\"search_keyword\\":[\\"phone\\"],\\"site\\":\\"United States\\"}"`. The server validates that it parses to a JSON object before execution. `targetMaxRows` is optional threshold-stop control for MCP task mode. A positive value requests `stopTask` after extractedCount reaches the target, but it is not a hard cap because polling is best-effort. `targetMaxRows=0` or omitting the field means no threshold stop and lets the task run until natural completion. Use `inputSchema[].field` as the parameter key contract. For source-backed fields, use root-level `sourceOptions` from exact template lookup and dependent `sourceOptions` from `validateOnly=true`, then pass the selected option `key` as the field value. MultiInput fields must use `string[]` even for a single value. Unmapped keys fail fast with `unmapped_parameters`.'
    },
    redeemCouponCode: {
      title: 'Redeem Coupon Code',
      description:
        'Redeem a promotion, coupon, or resource code for the current user. Use this when the user wants to claim an offer/优惠 and already has the code. When responding, always use the exact text from the "displayMessage" field in the result; do not compose your own reply.'
    }
  }
};

export default messages;
