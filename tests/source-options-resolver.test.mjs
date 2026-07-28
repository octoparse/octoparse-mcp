import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildTemplateSourceSchema,
  resolveDependentSourceOptions
} = await import('../dist/tools/source-options-resolver.js');

const parametersJson = JSON.stringify([
  {
    Id: '44b7f22e-ae69-f037-7912-25fafe69b9bb',
    DisplayText: 'Site',
    Remark: 'Select an Amazon site.',
    IsRequired: true,
    ParamName: '',
    DataType: 'String',
    ControlType: 'Dropdown',
    marks: { paramDisplayText: 'Site', description: '' },
    DataTypeOptions: { MinLen: 1, MaxLen: 5000, Regx: '', MegxMessage: '' },
    ControlOptions: {
      DataSourceType: 'External',
      ParentField: '',
      DataSource: 'DataSourc_xlsx',
      DataSourceFilter: '//root/A'
    }
  },
  {
    Id: '1f1effd0-b85c-7584-cdfb-2b4cd5798f5d',
    DisplayText: 'Confirm your site',
    Remark: 'Confirm the site you selected.',
    IsRequired: true,
    ParamName: 'mcz8ihqnzzs.List',
    DataType: 'String',
    ControlType: 'CheckboxList',
    marks: { paramDisplayText: 'Confirm your site', description: '' },
    DataTypeOptions: { MinLen: 1, MaxLen: 5000, Regx: '', MegxMessage: '' },
    ControlOptions: {
      MinItems: 1,
      MaxItems: 1,
      DataSourceType: 'External',
      ParentField: '44b7f22e-ae69-f037-7912-25fafe69b9bb',
      DataSource: 'DataSourc_xlsx',
      DataSourceFilter: '/B'
    }
  },
  {
    Id: '1790d044-f2ec-6cd3-df05-21201e10daca',
    DisplayText: 'Keywords (up to 100000)',
    IsRequired: true,
    ParamName: '2cfpr9gldlt.List',
    DataType: 'String',
    ControlType: 'MultiInput',
    ControlOptions: {
      MinLines: 1,
      MaxLines: 100000,
      Placeholder: 'Enter keywords'
    }
  }
]);

const fieldDataSourceJson = JSON.stringify({
  DataSourc_xlsx: `
    <root>
      <A name="United States"><B name="United States" value="https://www.amazon.com/" /></A>
      <A name="United Kingdom"><B name="United Kingdom" value="https://www.amazon.co.uk/" /></A>
      <A name="United States"><B name="United States Outlet" value="https://www.amazon.com/outlet" /></A>
    </root>
  `
});

test('buildTemplateSourceSchema deduplicates root options and builds dependency index', () => {
  const schema = buildTemplateSourceSchema({
    templateId: 42,
    versionId: 420,
    acceptLanguage: 'en-US',
    parametersJson,
    fieldDataSource: fieldDataSourceJson
  });

  assert.equal(schema.templateId, 42);
  assert.equal(schema.versionId, 420);
  assert.equal(schema.fieldKeyMap.site.field, 'Site');
  assert.equal(schema.fieldKeyMap.site.fieldId, '44b7f22e-ae69-f037-7912-25fafe69b9bb');
  assert.equal(schema.fieldKeyMap.confirm_your_site.field, 'Confirm your site');
  assert.equal(
    schema.fieldKeyMap.confirm_your_site.fieldId,
    '1f1effd0-b85c-7584-cdfb-2b4cd5798f5d'
  );

  assert.deepEqual(schema.rootFieldOptions.site, [
    { key: 'United States', label: 'United States' },
    { key: 'United Kingdom', label: 'United Kingdom' }
  ]);

  assert.deepEqual(schema.dependencyOptionIndex.confirm_your_site['United States'], [
    { key: 'https://www.amazon.com/', label: 'United States' },
    { key: 'https://www.amazon.com/outlet', label: 'United States Outlet' }
  ]);
  assert.deepEqual(schema.dependencyOptionIndex.confirm_your_site['United Kingdom'], [
    { key: 'https://www.amazon.co.uk/', label: 'United Kingdom' }
  ]);
});

test('resolveDependentSourceOptions returns awaiting_dependency when parent selection is missing', () => {
  const schema = buildTemplateSourceSchema({
    templateId: 42,
    versionId: 420,
    acceptLanguage: 'en-US',
    parametersJson,
    fieldDataSource: fieldDataSourceJson
  });

  const result = resolveDependentSourceOptions(schema, {});

  assert.deepEqual(result.sourceOptions, {});
  assert.deepEqual(result.awaitingDependency, [
    {
      fieldKey: 'confirm_your_site',
      dependsOn: 'site'
    }
  ]);
  assert.deepEqual(result.invalidSelections, []);
});

test('resolveDependentSourceOptions returns dependent options for selected parent key', () => {
  const schema = buildTemplateSourceSchema({
    templateId: 42,
    versionId: 420,
    acceptLanguage: 'en-US',
    parametersJson,
    fieldDataSource: fieldDataSourceJson
  });

  const result = resolveDependentSourceOptions(schema, {
    site: 'United States'
  });

  assert.deepEqual(result.awaitingDependency, []);
  assert.deepEqual(result.invalidSelections, []);
  assert.deepEqual(result.sourceOptions, {
    confirm_your_site: [
      { key: 'https://www.amazon.com/', label: 'United States' },
      { key: 'https://www.amazon.com/outlet', label: 'United States Outlet' }
    ]
  });
});

test('resolveDependentSourceOptions reports invalid parent selection', () => {
  const schema = buildTemplateSourceSchema({
    templateId: 42,
    versionId: 420,
    acceptLanguage: 'en-US',
    parametersJson,
    fieldDataSource: fieldDataSourceJson
  });

  const result = resolveDependentSourceOptions(schema, {
    site: 'Canada'
  });

  assert.deepEqual(result.sourceOptions, {});
  assert.deepEqual(result.awaitingDependency, []);
  assert.deepEqual(result.invalidSelections, [
    {
      fieldKey: 'site',
      selectedKey: 'Canada',
      allowedKeys: ['United States', 'United Kingdom']
    }
  ]);
});
