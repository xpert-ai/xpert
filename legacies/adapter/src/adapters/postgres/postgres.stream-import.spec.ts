import { Readable, Writable } from 'stream'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  BaseSQLQueryRunner: class {
    constructor(protected readonly options: unknown) {}
  },
  DBProtocolEnum: {
    SQL: 'sql'
  },
  DBSyntaxEnum: {
    SQL: 'sql'
  }
}))
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    connect: jest.fn()
  })),
  types: {
    builtins: {}
  }
}))
jest.mock('../../base', () => ({
  register: jest.fn()
}))

jest.mock('pg-copy-streams', () => ({
  from: jest.fn(
    () =>
      new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        }
      })
  )
}))

describe('PostgresRunner CSV stream import', () => {
  it('loads CSV through COPY FROM STDIN without requiring in-memory row data', async () => {
    const { PostgresRunner } = require('./postgres') as typeof import('./postgres')
    const runner = new PostgresRunner({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'postgres'
    })
    jest.spyOn(runner, 'connect').mockResolvedValue(undefined)
    const query = jest.fn((statement: string | Writable) => {
      if (typeof statement !== 'string') {
        return statement
      }

      return Promise.resolve()
    })
    runner.client = { query } as never

    await runner.importCsv(
      {
        name: 'sales',
        columns: [
          { name: 'id', fieldName: 'id', type: 'String', isKey: true },
          { name: 'amount', fieldName: 'amount', type: 'Number', isKey: false }
        ],
        file: {
          stream: Readable.from(['id,amount\n1,10\n'])
        } as never,
        mergeType: 'DELETE'
      },
      { catalog: 'demo' }
    )

    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "demo"."sales"')
    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS "demo"."sales"'))
    const createTableStatement = query.mock.calls.find(
      ([statement]) => typeof statement === 'string' && statement.startsWith('CREATE TABLE')
    )?.[0]
    expect(createTableStatement).not.toContain('PRIMARY KEY')
    const { from } = jest.requireMock('pg-copy-streams') as { from: jest.Mock }
    expect(from).toHaveBeenCalledWith(
      'COPY "demo"."sales" ("id","amount") FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER \',\')'
    )
  })

  it('reports CSV files with only a header row and no trailing newline', async () => {
    const { PostgresRunner } = require('./postgres') as typeof import('./postgres')
    const runner = new PostgresRunner({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'postgres'
    })
    jest.spyOn(runner, 'connect').mockResolvedValue(undefined)
    runner.client = {
      query: jest.fn((statement: string | Writable) => (typeof statement === 'string' ? Promise.resolve() : statement))
    } as never

    await expect(
      runner.importCsv(
        {
          name: 'sales',
          columns: [
            { name: 'id', fieldName: 'id', type: 'String', isKey: false },
            { name: 'amount', fieldName: 'amount', type: 'Number', isKey: false }
          ],
          file: {
            stream: Readable.from(['id,amount'])
          } as never,
          mergeType: 'DELETE'
        },
        { catalog: 'demo' }
      )
    ).rejects.toMatchObject({
      message: 'CSV file has header but no data rows'
    })
  })

  it('reports CSV files with only a header row and trailing newline before running SQL', async () => {
    const { PostgresRunner } = require('./postgres') as typeof import('./postgres')
    const runner = new PostgresRunner({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'postgres'
    })
    jest.spyOn(runner, 'connect').mockResolvedValue(undefined)
    const query = jest.fn((statement: string | Writable) =>
      typeof statement === 'string' ? Promise.resolve() : statement
    )
    runner.client = { query } as never

    await expect(
      runner.importCsv(
        {
          name: 'sales',
          columns: [
            { name: 'id', fieldName: 'id', type: 'String', isKey: false },
            { name: 'amount', fieldName: 'amount', type: 'Number', isKey: false }
          ],
          file: {
            stream: Readable.from(['id,amount\n'])
          } as never,
          mergeType: 'DELETE'
        },
        { catalog: 'demo' }
      )
    ).rejects.toMatchObject({
      message: 'CSV file has header but no data rows'
    })
    expect(query).not.toHaveBeenCalled()
  })
})
