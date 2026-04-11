import { BaseSQLQueryRunner } from '../base'
import { TrinoQueryRunner } from './trino'

describe('TrinoQueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new TrinoQueryRunner({
      host: '10.221.194.206',
      port: '8080',
    })
  })

  it('#describe', async () => {
    const result = await runner.describe('default', 'SELECT * FROM sales')

    console.log(result)
  })
})
