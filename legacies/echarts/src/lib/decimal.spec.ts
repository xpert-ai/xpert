import { formatNumber } from './decimal'

describe('formatNumber', () => {
  it('#Basic', () => {
    expect(formatNumber(123.12345, 'zh-Hans')).toEqual(`123.12`)
    expect(formatNumber(10000123.12345, 'zh-Hans')).toEqual(`10,000,123.12`)
    expect(formatNumber(3.12345, 'zh-Hans', '2.0-2')).toEqual(`3.12`)
    expect(formatNumber(3.1, 'zh-Hans', '2.0-2')).toEqual(`03.10`)
    expect(formatNumber(3, 'zh-Hans', '2.0-2')).toEqual(`03`)
  })
})
