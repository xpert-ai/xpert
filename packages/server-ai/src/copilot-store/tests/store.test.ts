import "dotenv/config";
import { CopilotMemoryStore } from '../store';
import { Pool } from 'pg';
import { GetOperation, PutOperation } from '@langchain/langgraph';

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
      organizationId: '6a08dab6-5b1c-4022-b99b-e582b10d8ea4'
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
