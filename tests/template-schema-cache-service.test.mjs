import test from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_ENABLED = 'true';
process.env.REDIS_TEMPLATE_SCHEMA_CACHE_TTL = '300';

const { AppConfig } = await import('../dist/config/app-config.js');
const { RedisClient } = await import('../dist/utils/redis.js');
const { TemplateSchemaCacheService } = await import('../dist/services/template-schema-cache-service.js');

function createFakeRedis() {
  const store = new Map();

  return {
    async get(key) {
      return store.has(key) ? store.get(key).value : null;
    },
    async set(key, value, mode, ttlKeyword, ttlSeconds) {
      store.set(key, {
        value,
        mode,
        ttlKeyword,
        ttlSeconds
      });
      return 'OK';
    },
    async del(key) {
      store.delete(key);
      return 1;
    },
    store
  };
}

test('TemplateSchemaCacheService caches source schema in redis when available', async () => {
  AppConfig.reset();
  const fakeRedis = createFakeRedis();
  const originalGetInstance = RedisClient.getInstance;
  RedisClient.getInstance = () => fakeRedis;

  let loadCalls = 0;

  const loader = async () => {
    loadCalls += 1;
    return {
      id: 420,
      templateId: 42,
      parameters: JSON.stringify([
        {
          Id: 'field-1',
          DisplayText: 'Site',
          ParamName: '',
          ControlType: 'Dropdown',
          ControlOptions: {
            DataSourceType: 'External',
            DataSource: 'DataSourc_xlsx',
            DataSourceFilter: '//root/A'
          }
        }
      ]),
      fieldDataSource: JSON.stringify({
        DataSourc_xlsx: '<root><A name="United States" /></root>'
      })
    };
  };

  try {
    const first = await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader
    });
    const second = await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader
    });

    assert.equal(loadCalls, 1);
    assert.equal(first.sourceSchema.rootFieldOptions.site.length, 1);
    assert.deepEqual(second.sourceSchema.rootFieldOptions.site, [
      { key: 'United States', label: 'United States' }
    ]);

    const cacheEntry = [...fakeRedis.store.values()][0];
    assert.equal(cacheEntry.mode, 'EX');
    assert.equal(cacheEntry.ttlKeyword, 300);
  } finally {
    RedisClient.getInstance = originalGetInstance;
    AppConfig.reset();
  }
});

test('TemplateSchemaCacheService isolates cache by versionIdHint', async () => {
  AppConfig.reset();
  const fakeRedis = createFakeRedis();
  const originalGetInstance = RedisClient.getInstance;
  RedisClient.getInstance = () => fakeRedis;

  let loadCalls = 0;

  try {
    await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader: async () => {
        loadCalls += 1;
        return {
          id: 420,
          templateId: 42,
          parameters: '[]',
          fieldDataSource: '{}'
        };
      }
    });

    await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 421,
      acceptLanguage: 'en-US',
      loader: async () => {
        loadCalls += 1;
        return {
          id: 421,
          templateId: 42,
          parameters: '[]',
          fieldDataSource: '{}'
        };
      }
    });

    assert.equal(loadCalls, 2);
  } finally {
    RedisClient.getInstance = originalGetInstance;
    AppConfig.reset();
  }
});

test('TemplateSchemaCacheService degrades safely when redis is unavailable', async () => {
  AppConfig.reset();
  const originalGetInstance = RedisClient.getInstance;
  RedisClient.getInstance = () => null;

  let loadCalls = 0;

  try {
    await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader: async () => {
        loadCalls += 1;
        return {
          id: 420,
          templateId: 42,
          parameters: '[]',
          fieldDataSource: '{}'
        };
      }
    });

    await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader: async () => {
        loadCalls += 1;
        return {
          id: 420,
          templateId: 42,
          parameters: '[]',
          fieldDataSource: '{}'
        };
      }
    });

    assert.equal(loadCalls, 2);
  } finally {
    RedisClient.getInstance = originalGetInstance;
    AppConfig.reset();
  }
});

test('TemplateSchemaCacheService normalizes legacy cached source schema shape', async () => {
  AppConfig.reset();
  const fakeRedis = createFakeRedis();
  const originalGetInstance = RedisClient.getInstance;
  RedisClient.getInstance = () => fakeRedis;

  const legacyCacheKey = 'template-schema:v1:42:en-US:420';
  fakeRedis.store.set(legacyCacheKey, {
    value: JSON.stringify({
      templateId: 42,
      versionId: 420,
      version: 7,
      acceptLanguage: 'en-US',
      parameters: '[]',
      sourceSchema: {
        templateId: 42,
        versionId: 420,
        acceptLanguage: 'en-US'
      }
    })
  });

  try {
    const entry = await TemplateSchemaCacheService.getOrLoad({
      templateId: 42,
      versionIdHint: 420,
      acceptLanguage: 'en-US',
      loader: async () => {
        throw new Error('legacy cache should be normalized without loader');
      }
    });

    assert.deepEqual(entry.sourceSchema.fieldKeyMap, {});
    assert.deepEqual(entry.sourceSchema.rootFieldOptions, {});
    assert.deepEqual(entry.sourceSchema.dependencyOptionIndex, {});
  } finally {
    RedisClient.getInstance = originalGetInstance;
    AppConfig.reset();
  }
});
