import { BaseSQLQueryRunner } from '../base'
import { HiveQueryRunner } from './hive'


describe('Hive QueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new HiveQueryRunner({
      host: '10.221.194.206',
      port: '10000',
    })
  })

  
  it('#getCatalogs', async () => {
    const result = await runner.getCatalogs()
    console.log(result)
  })

  it('#describe', async () => {
    const result = await runner.describe('default', 'SELECT * FROM sales')

    console.log(result)

  })

  it('#Query Select', async () => {
    const result = await runner.runQuery(`SELECT * FROM days`)
    console.log(result)
  })
  
  it('#Query DDL', async () => {
    const result = await runner.runQuery(`SHOW DATABASES`)
    expect(typeof result.columns.length).toEqual('number')
  })

  it('#Query Create database', async () => {
    const result = await runner.runQuery(`CREATE DATABASE emp`)
    if (result.status === 'OK') {
      expect(typeof result.columns.length).toEqual('number')
    } else {
      expect(result.error).toEqual('org.apache.hadoop.hive.ql.metadata.HiveException: Database emp already exists')
    }
  })

  it('#Query Multi statements', async () => {
    const result = await runner.runQuery(`SHOW DATABASES`)
    expect(typeof result.columns.length).toEqual('number')
  })
})
