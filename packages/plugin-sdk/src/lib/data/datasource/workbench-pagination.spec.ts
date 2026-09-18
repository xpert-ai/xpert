import { paginateMysqlQuery } from './workbench-pagination'

describe('MySQL bounded native pagination', () => {
  it.each([
    [
      'SELECT a.*, b.* FROM a JOIN b ON a.id = b.id',
      100,
      0,
      'SELECT a.*, b.* FROM a JOIN b ON a.id = b.id\nLIMIT 101 OFFSET 0'
    ],
    ['SELECT * FROM t LIMIT 500', 100, 100, 'SELECT * FROM t LIMIT 101 OFFSET 100'],
    ['SELECT * FROM t LIMIT 105', 100, 100, 'SELECT * FROM t LIMIT 5 OFFSET 100'],
    ['SELECT * FROM t LIMIT 10', 100, 100, 'SELECT * FROM t LIMIT 0 OFFSET 100'],
    ['SELECT * FROM t LIMIT 0', 100, 0, 'SELECT * FROM t LIMIT 0 OFFSET 0'],
    ['SELECT * FROM t LIMIT 50 OFFSET 20', 10, 10, 'SELECT * FROM t LIMIT 11 OFFSET 30'],
    ['SELECT * FROM t LIMIT 20, 50', 10, 10, 'SELECT * FROM t LIMIT 11 OFFSET 30'],
    ['SELECT * FROM t LIMIT 18446744073709551615', 100, 0, 'SELECT * FROM t LIMIT 101 OFFSET 0'],
    ['SELECT * FROM t -- LIMIT 1', 100, 0, 'SELECT * FROM t -- LIMIT 1\nLIMIT 101 OFFSET 0'],
    ['SELECT * FROM t LIMIT /* keep */ 5 # tail', 10, 0, 'SELECT * FROM t LIMIT 5 OFFSET 0 # tail'],
    [
      'SELECT * FROM (SELECT * FROM t LIMIT 500) a',
      100,
      0,
      'SELECT * FROM (SELECT * FROM t LIMIT 500) a\nLIMIT 101 OFFSET 0'
    ],
    [
      'WITH q(id) AS (SELECT 1 LIMIT 1) SELECT * FROM q',
      100,
      0,
      'WITH q(id) AS (SELECT 1 LIMIT 1) SELECT * FROM q\nLIMIT 101 OFFSET 0'
    ],
    ['SELECT 1 UNION ALL SELECT 2 ORDER BY 1', 100, 0, 'SELECT 1 UNION ALL SELECT 2 ORDER BY 1\nLIMIT 101 OFFSET 0'],
    ["SELECT 'LIMIT 50; ?' AS `limit`", 100, 0, "SELECT 'LIMIT 50; ?' AS `limit`\nLIMIT 101 OFFSET 0"]
  ])('preserves the result window of %s', (sql, limit, offset, expected) => {
    expect(paginateMysqlQuery(sql, [], limit, offset)).toEqual({ sql: expected, parameters: [] })
  })

  it('keeps expression bindings and consumes only outer LIMIT bindings', () => {
    const query = "SELECT ?, '?' AS `?` FROM (SELECT ? LIMIT ?) q WHERE id = ? LIMIT ? OFFSET ? -- ?"
    const result = paginateMysqlQuery(query, ['one', 'two', 1000, 'id', 105, 20], 100, 100)
    expect(result.parameters).toEqual(['one', 'two', 1000, 'id'])
    expect(result.sql).toBe("SELECT ?, '?' AS `?` FROM (SELECT ? LIMIT ?) q WHERE id = ? LIMIT 5 OFFSET 120 -- ?")
  })
  it('handles MySQL offset,count binding order', () => {
    expect(paginateMysqlQuery('SELECT ? LIMIT ?, ?', ['value', 20, 105], 100, 100)).toEqual({
      sql: 'SELECT ? LIMIT 5 OFFSET 120',
      parameters: ['value']
    })
  })
  it.each(['SELECT 1 LIMIT 1 + 2', "SELECT 1 LIMIT '5'", 'SELECT 1 LIMIT -1', 'SELECT 1 LIMIT ?', 'SELECT (1'])(
    'does not silently rewrite unsupported LIMIT expressions: %s',
    (sql) => {
      expect(() => paginateMysqlQuery(sql, [], 100, 0)).toThrow('unsupported_pagination')
    }
  )
})
