import { BaseSQLQueryRunner } from '../../base'
import { TableTopSubscribed } from '../mock'
import { MySQLRunner } from './mysql'

describe('MySQL QueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new MySQLRunner({
      host: '192.168.0.114',
      port: '3306',
      username: 'test',
      password: 'test',
      // database: 'foodmart',
      use_ssl: true,
      ssl_cacert: ``
    })
  })

  it('#getCatalogs', async () => {
    const result = await runner.getCatalogs()
  })

  it('#getSchema', async () => {
    const schema = await runner.getSchema('foodmart', 'topSubscribed')
    console.log(JSON.stringify(schema))
  })

  it('#describe', async () => {
    const result = await runner.describe('foodmart', 'SELECT * FROM topSubscribed')
    console.log(result)
  })

  it('#import', async () => {
    await runner.import({...TableTopSubscribed}, {catalog: 'foodmart'})

    const result = await runner.runQuery(`SELECT * FROM topSubscribed`, {catalog: 'foodmart'})
    expect(result.data.length).toEqual(15)
  })
})
