import { mysql } from './mysql'

describe('mysql', () => {
  it('should work', () => {
    expect(mysql()).toEqual('mysql')
  })
})
