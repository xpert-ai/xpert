import { BaseSQLQueryRunner } from '../../base'
import { TableTopSubscribed } from '../mock'
import { PostgresRunner } from './postgres'

describe('Postgres QueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new PostgresRunner({
      host: '192.168.0.114',
      port: '5432',
      username: 'demo',
      password: ``,
      database: 'demo'
    })
  })

  it('#getCatalogs', async () => {
    const result = await runner.getCatalogs()
    console.log(result)
  })

  it('#get schema', async () => {
    const result = await runner.getSchema('foodmart', 'category')
    console.log(JSON.stringify(result))
  })

  it('#runQuery', async () => {
    const result = await runner.runQuery(`SELECT * FROM account`, { catalog: 'foodmart' })
    console.log(JSON.stringify(result))
  })

  it('#import', async () => {
    const result = await runner.import(
      {
        ...TableTopSubscribed
      },
      { catalog: 'foodmart' }
    )
    console.log(JSON.stringify(result))
  })

  it('#dropTable', async () => {
    const result = await runner.dropTable(TableTopSubscribed.name, {catalog: 'foodmart'})
  })

  it('#describe', async () => {
    const result = await runner.describe('default', 'SELECT * FROM sales')

    console.log(result)
  })
})
