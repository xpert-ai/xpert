import { buildMembershipUsageTrend } from './usage-trend.utils'

describe('membership point consumption trend', () => {
  it('fills missing dates in the last 30 days, preserves point precision, and excludes older activity', () => {
    const trend = buildMembershipUsageTrend(
      [
        { date: '2026-09-13', pointsUsed: 900, tokenUsed: 10 },
        { date: '2026-09-14', pointsUsed: 0.05704, tokenUsed: 1 },
        { date: '2026-10-13', pointsUsed: 2, tokenUsed: 2 }
      ],
      new Date(2026, 9, 13),
      'en'
    )
    expect(trend.days).toHaveLength(30)
    expect(trend.days[0]).toMatchObject({ date: '2026-09-14', pointsUsed: 0.05704 })
    expect(trend.days[1]).toMatchObject({ date: '2026-09-15', pointsUsed: 0, height: 0 })
    expect(trend.days.at(-1)).toMatchObject({ date: '2026-10-13', height: 100 })
    expect(trend.maximum).toBe(2)
  })

  it('keeps empty usage at zero without inventing bar heights', () => {
    const trend = buildMembershipUsageTrend([], new Date(2026, 0, 4), 'en')
    expect(trend.maximum).toBe(0)
    expect(trend.days).toHaveLength(30)
    expect(trend.days.every((day) => day.height === 0)).toBe(true)
  })
})
