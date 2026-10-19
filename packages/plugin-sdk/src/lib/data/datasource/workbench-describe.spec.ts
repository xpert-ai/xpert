import { SqlDatabaseWorkbenchAdapter } from './workbench-adapter'
import type { DatabaseResult } from './workbench'

it('preserves authored PostgreSQL column comments through real adapter metadata mapping', async () => {
  const result: DatabaseResult = {
    columns: ['column_name', 'data_type', 'is_nullable', 'ordinal_position', 'column_default', 'column_comment'].map(
      (name, i) => ({ id: String(i), name })
    ),
    rows: [['amount', 'numeric', 'NO', 1, null, 'Paid minus refund, CNY']],
    durationMs: 0,
    outcome: 'succeeded',
    hasMore: false,
    truncated: false,
    diagnostics: []
  }
  const execute = jest
    .fn()
    .mockResolvedValueOnce(result)
    .mockResolvedValue({ ...result, rows: [] })
  const adapter = new SqlDatabaseWorkbenchAdapter('postgres', { execute, close: async () => {} })
  const detail = await adapter.describe({ schema: 'sales', name: 'orders', kind: 'table' })
  expect(execute.mock.calls[0][0]).toContain('pg_catalog.col_description(c.oid,a.attnum)')
  expect(execute.mock.calls[0][1]).toEqual(['sales', 'orders'])
  expect(detail.columns[0].comment).toBe('Paid minus refund, CNY')
})
