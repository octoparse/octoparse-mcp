import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ensureUIParametersDefaults,
  validateTemplateParameters
} = await import('../dist/tools/template-parameter-validation.js');

test('ensureUIParametersDefaults fills required UIParameter defaults', () => {
  const result = ensureUIParametersDefaults({
    UIParameters: [{ Id: 'ui-1', Value: ['iphone'] }],
    TemplateParameters: [{ ParamName: 'SearchKeyword', Value: ['iphone'] }]
  });

  assert.deepEqual(result, {
    UIParameters: [
      {
        Id: 'ui-1',
        Value: ['iphone'],
        Customize: { taskUrlRuleParam: [] },
        sourceTaskId: '',
        sourceField: ''
      }
    ],
    TemplateParameters: [{ ParamName: 'SearchKeyword', Value: ['iphone'] }]
  });
});

test('validateTemplateParameters rejects scalar MultiInput values', () => {
  const paramsJson = JSON.stringify([
    {
      Id: 'ui-1',
      ParamName: 'SearchKeyword',
      DisplayText: 'Search Keyword',
      ControlType: 'MultiInput',
      DataType: 'String',
      IsRequired: true
    }
  ]);

  assert.throws(
    () =>
      validateTemplateParameters(
        {
          UIParameters: [{ Id: 'ui-1', Value: 'iphone' }],
          TemplateParameters: [{ ParamName: 'SearchKeyword', Value: 'iphone' }]
        },
        paramsJson
      ),
    /MultiInput/i
  );
});
