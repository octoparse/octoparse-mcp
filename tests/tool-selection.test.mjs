import test from 'node:test';
import assert from 'node:assert/strict';

const {
  resolveToolSelection,
  applyResolvedToolSelection
} = await import('../dist/utils/tool-selection.js');
const { allTools } = await import('../dist/tools/tool-definitions.js');

test('resolveToolSelection keeps only included tools and then removes excluded tools', () => {
  assert.equal(typeof resolveToolSelection, 'function');

  const result = resolveToolSelection(
    {
      includeTools: ' search_templates , execute_task , export_data ',
      excludeTools: 'export_data'
    },
    allTools.map((tool) => tool.name)
  );

  assert.deepEqual(result.includeTools, ['search_templates', 'execute_task', 'export_data']);
  assert.deepEqual(result.excludeTools, ['export_data']);
  assert.deepEqual(result.resolvedToolNames, ['search_templates', 'execute_task']);
  assert.deepEqual(result.unknownToolNames, []);
});

test('resolveToolSelection reports unknown tool names', () => {
  const result = resolveToolSelection(
    {
      includeTools: 'search_templates,missing_tool',
      excludeTools: 'bad_tool'
    },
    allTools.map((tool) => tool.name)
  );

  assert.deepEqual(result.unknownToolNames, ['missing_tool', 'bad_tool']);
});

test('applyResolvedToolSelection returns matching tool definitions in source order', () => {
  assert.equal(typeof applyResolvedToolSelection, 'function');

  const selectedTools = applyResolvedToolSelection(allTools, ['execute_task', 'search_templates']);

  assert.deepEqual(
    selectedTools.map((tool) => tool.name),
    ['search_templates', 'execute_task']
  );
});
