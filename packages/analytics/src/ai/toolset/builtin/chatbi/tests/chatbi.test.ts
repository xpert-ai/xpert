import { tryFixChartType } from '../types'

describe('tryFixChartType', () => {
  it('should return a fixed chart type when input ends with "Chart"', () => {
    const input = 'BarChart'
    const result = tryFixChartType(input)
    expect(result).not.toBeNull()
    expect(result.type).toBe('Bar')
  })

  it('should return null when input does not end with "Chart"', () => {
    const input = 'Bar'
    const result = tryFixChartType(input)
    expect(result).toBeNull()
  })

  it('should return null when input does not end with "Table"', () => {
    const input = 'Table'
    const result = tryFixChartType(input)
    expect(result).toBeNull()
  })

  it('should handle empty string input', () => {
    const input = ''
    const result = tryFixChartType(input)
    expect(result).toBeNull()
  })

  it('should handle null input', () => {
    const result = tryFixChartType(null)
    expect(result).toBeNull()
  })
})
