import { parseQueryBoolean } from './query'

describe('query utils', () => {
  it('parses boolean query values', () => {
    expect(parseQueryBoolean(true)).toBe(true)
    expect(parseQueryBoolean(false)).toBe(false)
    expect(parseQueryBoolean('true')).toBe(true)
    expect(parseQueryBoolean('1')).toBe(true)
    expect(parseQueryBoolean('yes')).toBe(true)
    expect(parseQueryBoolean('on')).toBe(true)
    expect(parseQueryBoolean('false')).toBe(false)
    expect(parseQueryBoolean('0')).toBe(false)
    expect(parseQueryBoolean(undefined)).toBe(false)
  })

  it('supports repeated query values', () => {
    expect(parseQueryBoolean(['false', 'true'])).toBe(true)
    expect(parseQueryBoolean(['false', '0'])).toBe(false)
  })
})
