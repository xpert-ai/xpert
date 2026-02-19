import { BaseSQLQueryRunner } from '../base'
import { PrestoQueryRunner } from './presto'

describe('PrestoQueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new PrestoQueryRunner({
      host: '10.221.194.206',
      port: '8080',
    })
  })

  it('#describe', async () => {
    const result = await runner.describe('default', 'SELECT * FROM sales')

    console.log(result)
  })
})
