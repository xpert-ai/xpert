import { requireReadStatement, splitWorkbenchSql } from './workbench-sql'
import { SqlDatabaseWorkbenchAdapter } from './workbench-adapter'
import type { DatabaseResult } from './workbench'

describe('issue #1223: parenthesized read-only expressions', () => {
  const filteredAggregate = [
    'SELECT region, SUM(sales_amount) AS sales_amount FROM sales_demo',
    'WHERE (? IS NULL OR ordered_at >= ?)',
    'AND (? IS NULL OR region = ?) AND (? IS NULL OR category = ?)',
    'GROUP BY region HAVING (SUM(sales_amount) > 0)'
  ].join('\n')

  it.each([
    'SELECT 1 AS n',
    'SELECT 1 AS n WHERE 1=1',
    'SELECT 1 AS n WHERE (1=1)',
    'select 1 where/* predicate */((1=1) and (2=2))',
    'SELECT 1 WHERE -- predicate\n(1=1)',
    'SELECT 1 WHERE (EXISTS (SELECT 1 WHERE (1=1)))',
    'SELECT COUNT(*) FROM sales_demo HAVING (COUNT(*) > 0)',
    'SELECT CASE WHEN (1=1) THEN (1) ELSE (0) END',
    'SELECT CASE (1) WHEN (1) THEN (1) ELSE (0) END',
    filteredAggregate
  ])('accepts parenthesized expressions: %s', (sql) => {
    expect(splitWorkbenchSql(sql)[0].effect).toBe('read')
    expect(requireReadStatement(sql)).toBe(sql)
  })

  it.each([
    'SELECT 1 WHERE (SLEEP(1) = 0)',
    'SELECT 1 WHERE (my_custom_mutator() = 0)',
    'SELECT by(1)',
    'SELECT 1 WHERE (EXISTS (SELECT my_custom_mutator()))',
    'SELECT 1 WHERE (custom.count(1) = 1)',
    'SELECT 1 WHERE ("where"(1) = 1)',
    'SELECT 1 WHERE (`where`(1) = 1)',
    'SELECT COUNT(*) FROM sales_demo HAVING (my_custom_mutator() = 0)',
    'SELECT CASE WHEN (my_custom_mutator() = 0) THEN 1 ELSE 0 END',
    'SELECT CASE WHEN (1=1) THEN (my_custom_mutator()) ELSE 0 END',
    'SELECT CASE WHEN (1=1) THEN 1 ELSE (my_custom_mutator()) END',
    'SELECT CASE (my_custom_mutator()) WHEN 1 THEN 1 END',
    'SELECT region FROM sales_demo ORDER BY (my_custom_mutator())',
    'SELECT 1 WHERE (EXISTS (DELETE FROM sales_demo RETURNING region))',
    "SELECT 1 WHERE (1=1) INTO OUTFILE '/tmp/out'",
    'SELECT * FROM sales_demo WHERE (1=1) FOR UPDATE',
    'SELECT 1 WHERE (1=1); DELETE FROM sales_demo',
    'SELECT 1 WHERE (1=1); SELECT 2',
    "SELECT 1 WHERE (1=1) /*!50000 INTO OUTFILE '/tmp/out' */"
  ])('preserves read-only restrictions inside and after parentheses: %s', (sql) => {
    expect(() => requireReadStatement(sql)).toThrow()
  })

  it('executes the filtered aggregate through the MySQL adapter with parameters and read-only transaction', async () => {
    const result: DatabaseResult = {
      columns: [
        { id: 'region', name: 'region' },
        { id: 'sales_amount', name: 'sales_amount' }
      ],
      rows: [['East', '120.00']],
      durationMs: 1,
      hasMore: false,
      truncated: false,
      outcome: 'succeeded',
      diagnostics: []
    }
    const execute = jest.fn().mockResolvedValue(result)
    const adapter = new SqlDatabaseWorkbenchAdapter('mysql', { execute, close: async () => {} })
    const parameters = [null, null, 'East', 'East', null, null]
    await expect(adapter.query({ mode: 'read', sql: filteredAggregate, parameters, limit: 10 })).resolves.toEqual(
      result
    )
    expect(execute.mock.calls.map(([sql]) => sql)).toEqual([
      'START TRANSACTION READ ONLY',
      `${filteredAggregate}\nLIMIT 11 OFFSET 0`,
      'ROLLBACK'
    ])
    expect(execute.mock.calls[1][1]).toEqual(parameters)
  })

  it('rejects an unsafe parenthesized query before transport execution', async () => {
    const execute = jest.fn()
    const adapter = new SqlDatabaseWorkbenchAdapter('mysql', { execute, close: async () => {} })
    await expect(adapter.query({ mode: 'read', sql: 'SELECT 1 WHERE (SLEEP(1) = 0)' })).rejects.toThrow(
      'read_only_violation'
    )
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('workbench derived-table read classification', () => {
  const profile = [
    'SELECT COUNT(*) AS sample_rows,',
    'COUNT(`order_id`) AS `order_id_non_null`,',
    'COUNT(`customer_id`) AS `customer_id_non_null`',
    'FROM (SELECT * FROM `db_studio_demo`.`orders` LIMIT 1000) AS sample'
  ].join('\n')

  it.each([
    profile,
    'SELECT COUNT(*) FROM (SELECT 1) AS sample',
    'select count(*) from/*sample*/(select 1) as sample',
    'SELECT * FROM (SELECT * FROM (SELECT 1) AS inner_sample) AS outer_sample',
    'WITH q AS (SELECT 1 AS id) SELECT * FROM (SELECT * FROM q) AS sample',
    'SELECT * FROM orders JOIN (SELECT 1 AS id) AS sample ON orders.id = sample.id',
    'SELECT * FROM orders LEFT JOIN (SELECT 1 AS id) AS sample ON orders.id = sample.id',
    'EXPLAIN SELECT COUNT(*) FROM (SELECT 1) AS sample'
  ])('accepts read-only derived tables: %s', (sql) => {
    expect(splitWorkbenchSql(sql)[0].effect).toBe('read')
    expect(requireReadStatement(sql)).toBe(sql)
  })

  it.each([
    'SELECT * FROM (DELETE FROM orders RETURNING *) AS sample',
    'WITH q AS (DELETE FROM orders RETURNING *) SELECT * FROM (SELECT * FROM q) AS sample',
    "SELECT * FROM (SELECT 1 INTO OUTFILE '/tmp/out') AS sample",
    'SELECT * FROM (SELECT * FROM orders FOR UPDATE) AS sample',
    'SELECT * FROM (SELECT pg_sleep(1)) AS sample',
    'SELECT * FROM (SELECT my_custom_mutator()) AS sample',
    'SELECT * FROM orders JOIN (SELECT my_custom_mutator()) AS sample ON TRUE',
    'SELECT * FROM (SELECT "pg_sleep"(1)) AS sample',
    'SELECT * FROM (SELECT custom.count(*)) AS sample',
    'SELECT * FROM (SELECT 1) AS sample; DELETE FROM orders',
    "SELECT * FROM (SELECT 1 /*!50000 INTO OUTFILE '/tmp/out' */) AS sample"
  ])('still rejects unsafe derived tables: %s', (sql) => {
    expect(() => requireReadStatement(sql)).toThrow()
  })

  it.each(['doris', 'mysql', 'postgres'] as const)(
    'passes bounded profile SQL through the %s adapter',
    async (engine) => {
      const result: DatabaseResult = {
        columns: [],
        rows: [],
        durationMs: 1,
        hasMore: false,
        truncated: false,
        outcome: 'succeeded',
        diagnostics: []
      }
      const execute = jest.fn().mockResolvedValue(result)
      const adapter = new SqlDatabaseWorkbenchAdapter(engine, { execute, close: async () => {} })
      const sql = engine === 'postgres' ? profile.replace(/`/g, '"') : profile
      await expect(adapter.query({ mode: 'read', sql, limit: 100 })).resolves.toEqual(result)
      const query = execute.mock.calls.find(([statement]) => statement.includes(sql))
      expect(query?.[0]).toContain(sql)
      expect(query?.[0]).toContain('LIMIT 101 OFFSET 0')
    }
  )
})

describe('workbench syntax positions are not function calls', () => {
  it.each([
    'SELECT * FROM orders WHERE (? IS NULL OR company = ?) AND (? IS NULL OR month >= ?)',
    'SELECT * FROM orders WHERE/* filter */((company = ?) OR (company IS NULL))',
    'SELECT company, COUNT(*) FROM orders GROUP BY company HAVING (COUNT(*) > ?)',
    "SELECT DATE_FORMAT(`ods_create_time`, '%Y-%m') AS `month`, `vendorName`, COUNT(DISTINCT `oaRequestId`) AS `orderCount`, COUNT(*) AS `itemCount` FROM `ODS`.`ods_ps_prWorkFlowLink_item` WHERE (? IS NULL OR `vendorName` = ?) AND (? IS NULL OR DATE_FORMAT(`ods_create_time`, '%Y-%m') >= ?) AND (? IS NULL OR DATE_FORMAT(`ods_create_time`, '%Y-%m') <= ?) GROUP BY 1, 2",
    'WITH q(id) AS (SELECT 1) SELECT * FROM q',
    'WITH RECURSIVE q(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM q WHERE id < 3) SELECT * FROM q',
    'WITH q(id) AS (SELECT 1), r(id) AS (SELECT id FROM q) SELECT * FROM r',
    'WITH `q`(`id`) AS (SELECT 1) SELECT * FROM `q`',
    'SELECT * FROM (WITH q(id) AS (SELECT 1) SELECT * FROM q) s',
    "SELECT TO_CHAR(DATE_TRUNC('month', ordered_at), 'YYYY-MM') AS month FROM orders",
    'SELECT CAST(1 AS DECIMAL(10,2))',
    'SELECT"column"FROM"table"',
    'SELECT CAST(COALESCE(amount, 0) AS NUMERIC(10,2)) FROM orders',
    'SELECT CONVERT(amount, DECIMAL(10,2)) FROM orders',
    'SELECT amount::NUMERIC(10,2) FROM orders'
  ])('accepts supported syntax: %s', (sql) => expect(requireReadStatement(sql)).toBe(sql))

  it.each([
    'SELECT * FROM orders WHERE (SLEEP(1) = 0)',
    'SELECT * FROM orders WHERE (my_custom_mutator() = 1)',
    'SELECT COUNT(*) FROM orders HAVING (my_custom_mutator() = 1)',
    "SELECT * FROM orders WHERE (id = 1) INTO OUTFILE '/tmp/out'",
    'SELECT * FROM orders WHERE (id = 1); DELETE FROM orders',
    'WITH q(id) AS (SELECT 1) SELECT q(id) FROM q',
    'SELECT DECIMAL(10,2)',
    'SELECT CAST(1 AS custom_type(10,2))',
    'SELECT CAST(my_custom_mutator() AS DECIMAL(10,2))',
    'SELECT CAST(1 AS DECIMAL(my_custom_mutator(),2))',
    'WITH q(id) AS (DELETE FROM orders RETURNING id) SELECT * FROM q',
    'WITH q(id) AS (SELECT SLEEP(1)) SELECT * FROM q'
  ])('still rejects unsafe calls: %s', (sql) => expect(() => requireReadStatement(sql)).toThrow())
})

describe('mysql pagination preserves duplicate output column names', () => {
  it('executes a top-level SELECT without a derived table', async () => {
    const execute = jest.fn().mockResolvedValue({
      columns: [
        { id: '0', name: 'id' },
        { id: '1', name: 'id' }
      ],
      rows: [[1, 2]],
      durationMs: 1,
      outcome: 'succeeded',
      hasMore: false,
      truncated: false,
      diagnostics: []
    })
    const adapter = new SqlDatabaseWorkbenchAdapter('mysql', { execute, close: async () => {} })
    const result = await adapter.query({ mode: 'read', sql: 'SELECT 1 AS id, 2 AS id', limit: 100 })
    expect(execute.mock.calls[1][0]).toBe('SELECT 1 AS id, 2 AS id\nLIMIT 101 OFFSET 0')
    expect(result.columns.map((column) => column.name)).toEqual(['id', 'id'])
    expect(result.rows).toEqual([[1, 2]])
  })
})
