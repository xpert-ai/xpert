import { IMembershipUsageBucket } from '@xpert-ai/contracts'
import { buildMembershipUsageHeatmap } from './usage-heatmap.utils'

export function buildMembershipUsageTrend(buckets: IMembershipUsageBucket[], end: Date, locale: string) {
  const days = buildMembershipUsageHeatmap(buckets, end, locale)
    .weeks.flatMap((week) => week.cells)
    .filter((cell) => cell !== null)
    .slice(-30)
  const maximum = Math.max(0, ...days.map((day) => day.pointsUsed))
  return {
    maximum,
    days: days.map((day) => ({ ...day, height: maximum > 0 ? (day.pointsUsed / maximum) * 100 : 0 }))
  }
}
