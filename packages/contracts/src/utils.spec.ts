import { isBlank, isNil, isString, nonBlank, nonNullable } from './utils'

describe('contract value predicates', () => {
  it('identifies nullish values', () => {
    expect(isNil(null)).toBe(true)
    expect(isNil(undefined)).toBe(true)
    expect(isNil(false)).toBe(false)
    expect([null, 'value', undefined].filter(nonNullable)).toEqual(['value'])
  })

  it('identifies strings across primitive and boxed values', () => {
    expect(isString('value')).toBe(true)
    expect(isString(Object('value'))).toBe(true)
    expect(isString(1)).toBe(false)
  })

  it('treats nullish and whitespace-only strings as blank', () => {
    expect(isBlank(null)).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank('value')).toBe(false)
    expect(isBlank(0)).toBe(false)
    expect(isBlank(false)).toBe(false)
    expect([null, '', 'value', 0, false].filter(nonBlank)).toEqual(['value', 0, false])
  })
})
