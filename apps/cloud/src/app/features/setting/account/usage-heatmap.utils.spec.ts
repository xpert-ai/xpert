import { buildMembershipUsageHeatmap } from './usage-heatmap.utils'

describe('buildMembershipUsageHeatmap', () => {
  it('fills the current and previous 11 calendar months and groups days into weeks', () => {
    const heatmap = buildMembershipUsageHeatmap(
      [
        { date: '2025-08-01', pointsUsed: 1, tokenUsed: 25 },
        { date: '2026-07-21', pointsUsed: 2, tokenUsed: 50 },
        { date: '2026-07-22', pointsUsed: 3, tokenUsed: 100 }
      ],
      new Date(2026, 6, 22, 12),
      'en-US'
    )

    const cells = heatmap.weeks.flatMap((week) => week.cells).filter((cell) => cell !== null)

    expect(heatmap.weeks).toHaveLength(52)
    expect(cells).toHaveLength(356)
    expect(cells[0].date).toBe('2025-08-01')
    expect(cells.at(-1)?.date).toBe('2026-07-22')
    expect(heatmap.weeks.map((week) => week.monthLabel).filter(Boolean)).toEqual([
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul'
    ])
  })

  it('fills missing days, aggregates duplicate buckets and assigns token intensity levels', () => {
    const heatmap = buildMembershipUsageHeatmap(
      [
        { date: '2026-07-21', pointsUsed: 1.5, tokenUsed: 20 },
        { date: '2026-07-21', pointsUsed: 0.5, tokenUsed: 5 },
        { date: '2026-07-22', pointsUsed: 4, tokenUsed: 100 }
      ],
      new Date(2026, 6, 22, 12),
      'zh-CN'
    )
    const cells = heatmap.weeks.flatMap((week) => week.cells).filter((cell) => cell !== null)

    expect(cells.find((cell) => cell.date === '2026-07-20')).toMatchObject({
      pointsUsed: 0,
      tokenUsed: 0,
      level: 0
    })
    expect(cells.find((cell) => cell.date === '2026-07-21')).toMatchObject({
      pointsUsed: 2,
      tokenUsed: 25,
      level: 1
    })
    expect(cells.find((cell) => cell.date === '2026-07-22')).toMatchObject({
      tokenUsed: 100,
      level: 4
    })
  })

  it('treats token values below one as zero usage', () => {
    const heatmap = buildMembershipUsageHeatmap(
      [{ date: '2026-07-22', pointsUsed: 0, tokenUsed: 0.9 }],
      new Date(2026, 6, 22, 12),
      'zh-CN'
    )
    const cell = heatmap.weeks.flatMap((week) => week.cells).find((item) => item?.date === '2026-07-22')

    expect(cell).toMatchObject({ tokenUsed: 0, level: 0 })
  })
})
