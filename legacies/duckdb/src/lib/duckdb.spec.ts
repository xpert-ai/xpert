import { duckdb } from './duckdb'

describe('duckdb', () => {
  it('should work', () => {
    expect(duckdb()).toEqual('duckdb')
  })
})
