import { resolveTrustProxy } from './trust-proxy'

describe('resolveTrustProxy', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['true', true],
    ['false', false],
    ['2', 2],
    ['loopback', 'loopback']
  ])('parses %s', (value, expected) => {
    expect(resolveTrustProxy(value)).toBe(expected)
  })
})
