import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatWorkflowResourceMarkdown } from "./tools/workflow-hints.js";
import { registerWidgetResources } from './widget-adapter/resource-registry.js';
import type { UiClientPolicy } from './widget-adapter/ui-client-policy.js';

const OCTOPARSE_WORKFLOW_URI = "octoparse://workflow";

/**
 * Static doc: 3-tool pipeline, relevance vs likes, execute_task params, poll/export.
 */
export const registerOctoparseWorkflowResource = (server: McpServer): void => {
  server.registerResource(
    "octoparse-workflow",
    OCTOPARSE_WORKFLOW_URI,
    {
      title: "Octoparse MCP workflow",
      description: "3-tool workflow and parameter rules",
      mimeType: "text/markdown"
    },
    async () => ({
      contents: [
        {
          uri: OCTOPARSE_WORKFLOW_URI,
          text: formatWorkflowResourceMarkdown()
        }
      ]
    })
  );
};

/**
 * Register all MCP resources
 */
export const registerAllResources = (
  server: McpServer,
  options: {
    uiPolicy?: UiClientPolicy;
    /** @deprecated Use uiPolicy. */
    uiMetaEnabled?: boolean;
  } = {}
): void => {
  registerOctoparseWorkflowResource(server);
  registerWidgetResources(server, {
    uiPolicy: options.uiPolicy,
    uiMetaEnabled: options.uiMetaEnabled
  });
};
