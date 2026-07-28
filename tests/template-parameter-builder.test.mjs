import test from 'node:test';
import assert from 'node:assert/strict';

const { buildInputSchemaForLlm } = await import('../dist/tools/template-parameter-builder.js');
const { buildTemplateSourceSchema } = await import('../dist/tools/source-options-resolver.js');

const parametersJson = JSON.stringify([
  {
    Id: 'source-1',
    DisplayText: 'Site',
    Remark: 'Select an Amazon site.',
    IsRequired: true,
    ParamName: '',
    DataType: 'String',
    ControlType: 'Dropdown',
    marks: { paramDisplayText: 'Site', description: '' },
    DataTypeOptions: { MinLen: 1, MaxLen: 5000 },
    ControlOptions: {
      DataSourceType: 'External',
      ParentField: '',
      DataSource: 'DataSourc_xlsx',
      DataSourceFilter: '//root/A'
    }
  },
  {
    Id: 'normal-1',
    DisplayText: 'Keywords (up to 100000)',
    Remark: 'Enter a list of keywords.',
    IsRequired: true,
    ParamName: '2cfpr9gldlt.List',
    DataType: 'String',
    DataTypeOptions: { MinLen: 1, MaxLen: 5000 },
    ControlType: 'MultiInput',
    ControlOptions: {
      Placeholder: 'Enter keywords'
    }
  }
]);

const fieldDataSourceJson = JSON.stringify({
  DataSourc_xlsx: '<root><A name="United States" /></root>'
});

test('buildInputSchemaForLlm uses canonical field keys, keeps label and length limits, and omits placeholder', () => {
  const sourceSchema = buildTemplateSourceSchema({
    templateId: 42,
    versionId: 420,
    acceptLanguage: 'en-US',
    parametersJson,
    fieldDataSource: fieldDataSourceJson
  });

  const result = buildInputSchemaForLlm(parametersJson, { sourceSchema });

  assert.deepEqual(result[0], {
    field: 'site',
    label: 'Site',
    type: 'string',
    required: true,
    uiType: 'Dropdown',
    description: 'Site (Instruction: Select an Amazon site.)',
    minLen: 1,
    maxLen: 5000,
    fieldId: 'source-1',
    sourceBacked: true
  });

  assert.equal(result[1].field, 'keywords');
  assert.equal(result[1].label, 'Keywords (up to 100000)');
  assert.equal(result[1].minLen, 1);
  assert.equal(result[1].maxLen, 5000);
  assert.equal(result[1].valueFormat, 'string[]');
  assert.deepEqual(result[1].example, ['keyword1', 'keyword2']);
  assert.equal('placeHolder' in result[1], false);
  assert.equal('fieldKey' in result[0], false);
});
