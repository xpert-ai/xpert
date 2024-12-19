import "dotenv/config";
import { CopilotMemoryStore } from '../store';
import { Pool } from 'pg';
import { GetOperation, OperationResults, PutOperation, SearchOperation } from '@langchain/langgraph';
import { OllamaEmbeddings } from "@langchain/ollama";

describe('InCopilotStore', () => {
  let store: CopilotMemoryStore;
  let mockPool: Pool;

  beforeEach(async () => {
    mockPool = new Pool({
      connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@localhost:5432/${process.env.DB_NAME}`
    });

    store = new CopilotMemoryStore({
      pgPool: mockPool,
      tenantId: '31258ebb-23ad-42a5-927b-0c3c44c82b36',
      organizationId: '6a08dab6-5b1c-4022-b99b-e582b10d8ea4',
      userId: ''
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // await mockPool.end()
  });

  describe('batch', () => {
    it('should handle batch operations', async () => {
      const getOp: GetOperation = { key: 'key1', namespace: ['namespace'] };
      const putOp: PutOperation = { key: 'key1', namespace: ['namespace'], value: { data: 'value1' } };
      const ops = [getOp, putOp];

      const results = await store.batch(ops);

      console.log(results)

      expect(results).toHaveLength(ops.length);
    });
  });

  // describe('batchGetOps', () => {
  //   it('should execute batch get operations', async () => {
  //     const getOps: Array<[number, GetOperation]> = [[0, { key: 'key1', namespace: ['namespace'] }]];
  //     const results: { key: string; value: string }[] = [];

  //     jest.spyOn(mockPool, 'query').mockResolvedValueOnce({ rows: [{ key: 'key1', value: 'value1' }] });

  //     await store['batchGetOps'](getOps, results);

  //     expect(results[0]).toEqual({ key: 'key1', value: 'value1' });
  //   });
  // });

  // describe('batchPutOps', () => {
  //   it('should execute batch put operations', async () => {
  //     const putOps: Array<[number, PutOperation]> = [[0, { type: 'PutOperation', key: 'key2', namespace: ['namespace'], value: { data: 'value' } }]];

  //     jest.spyOn(store, 'prepareBatchPutQueries').mockReturnValueOnce([['query', ['params']]]);

  //     await store['batchPutOps'](putOps);

  //     expect(store.prepareBatchPutQueries).toHaveBeenCalledWith(putOps);
  //     expect(mockPool.query).toHaveBeenCalledWith('query', ['params']);
  //   });
  // });

  // describe('prepareBatchPutQueries', () => {
  //   it('should prepare batch put queries', () => {
  //     const putOps: Array<[number, PutOperation]> = [[0, { type: 'PutOperation', key: 'key2', namespace: ['namespace'], value: { data: 'value' } }]];

  //     const queries = store['prepareBatchPutQueries'](putOps);

  //     expect(queries).toBeInstanceOf(Array);
  //     expect(queries[0]).toBeInstanceOf(Array);
  //   });
  // });

});

describe('batchSearchOps', () => {
  let store: CopilotMemoryStore;
  let mockPool: Pool;

  beforeEach(async () => {
    mockPool = new Pool({
      connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@localhost:5432/${process.env.DB_NAME}`
    });

    store = new CopilotMemoryStore({
      pgPool: mockPool,
      tenantId: '31258ebb-23ad-42a5-927b-0c3c44c82b36',
      organizationId: '6a08dab6-5b1c-4022-b99b-e582b10d8ea4',
      userId: '91604a85-5870-4d1a-ae9d-566a4da60004',
      index: {
        dims: null,
        embeddings: new OllamaEmbeddings({
          baseUrl: `${process.env.OLLAMA_URL}`,
			    model: `${process.env.OLLAMA_EMBEDDINGS_MODEL}`
        }),
        fields: ['profile']
      }
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // await mockPool.end()
  });

  it('should execute batch search operations with embeddings', async () => {
    await store.put(['namespace'], 'key1', {profile: ' I am king'})

    const searchOps: Array<[number, SearchOperation]> = [
      [0, { query: 'king', namespacePrefix: ['namespace'], limit: 10, offset: 0 }]
    ];
    const results: OperationResults<SearchOperation[]> = [];

    await store['batchSearchOps'](searchOps, results);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ key: 'key1', value: 'value1' });
  });

  it('should handle batch search operations without embeddings', async () => {
    const searchOps: Array<[number, SearchOperation]> = [
      [0, { query: null, namespacePrefix: ['namespace'], limit: 10, offset: 0 }]
    ];
    const results: OperationResults<SearchOperation[]> = [];

    // 直接运行在实际的数据库上
    await store['batchSearchOps'](searchOps, results);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({ key: 'key1', value: expect.objectContaining({ data: 'value1' }) }));
  });
});