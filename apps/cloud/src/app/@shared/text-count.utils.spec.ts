import { countDisplayTextUnits } from './text-count.utils'

describe('countDisplayTextUnits', () => {
  it('returns 0 for empty content', () => {
    expect(countDisplayTextUnits('')).toBe(0)
    expect(countDisplayTextUnits('   ')).toBe(0)
    expect(countDisplayTextUnits(null)).toBe(0)
    expect(countDisplayTextUnits(undefined)).toBe(0)
  })

  it('counts Han characters individually', () => {
    expect(countDisplayTextUnits('用户档案')).toBe(4)
    expect(countDisplayTextUnits('长期记忆')).toBe(4)
  })

  it('counts latin words by contiguous segments', () => {
    expect(countDisplayTextUnits('be direct and useful')).toBe(4)
    expect(countDisplayTextUnits("don't repeat yourself")).toBe(3)
  })

  it('counts mixed Chinese and English content with the expected rule', () => {
    expect(countDisplayTextUnits('中文 hello world')).toBe(4)
    expect(countDisplayTextUnits('用户偏好: be direct')).toBe(6)
  })

  it('ignores whitespace and punctuation between units', () => {
    expect(countDisplayTextUnits('你好，world!\n效率-first.')).toBe(6)
  })
})
