import { IMembershipUsageBucket } from '@xpert-ai/contracts'

export type MembershipUsageHeatmapLevel = 0 | 1 | 2 | 3 | 4

export type MembershipUsageHeatmapCell = IMembershipUsageBucket & {
  dateValue: Date
  level: MembershipUsageHeatmapLevel
}

export type MembershipUsageHeatmapWeek = {
  key: string
  monthLabel: string
  cells: Array<MembershipUsageHeatmapCell | null>
}

export type MembershipUsageHeatmapModel = {
  weeks: MembershipUsageHeatmapWeek[]
}

export const MEMBERSHIP_USAGE_HEATMAP_LEVELS: MembershipUsageHeatmapLevel[] = [0, 1, 2, 3, 4]

const DAYS_IN_WEEK = 7

export function getMembershipUsageHeatmapRange(endDate: Date) {
  const end = new Date(endDate)
  const start = startOfDay(new Date(end.getFullYear(), end.getMonth() - 11, 1))
  return { start, end }
}

export function buildMembershipUsageHeatmap(
  buckets: IMembershipUsageBucket[],
  endDate: Date,
  locale: string
): MembershipUsageHeatmapModel {
  const range = getMembershipUsageHeatmapRange(endDate)
  const rangeStart = range.start
  const rangeEnd = startOfDay(range.end)
  const firstWeekStart = startOfWeek(rangeStart)
  const bucketByDate = aggregateBuckets(buckets)
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' })
  const weeks: MembershipUsageHeatmapWeek[] = []

  for (let weekStart = firstWeekStart; weekStart.getTime() <= rangeEnd.getTime(); weekStart = addDays(weekStart, 7)) {
    const monthLabelDate = getMonthLabelDate(weekStart, rangeStart, rangeEnd, weeks.length === 0)
    const dailyCells = Array.from({ length: DAYS_IN_WEEK }, (_, dayIndex) => {
      const dateValue = addDays(weekStart, dayIndex)
      if (dateValue.getTime() < rangeStart.getTime() || dateValue.getTime() > rangeEnd.getTime()) {
        return null
      }

      const date = formatDateKey(dateValue)
      const bucket = bucketByDate.get(date) ?? { date, pointsUsed: 0, tokenUsed: 0 }
      return {
        ...bucket,
        dateValue,
        level: 0 as MembershipUsageHeatmapLevel
      }
    })

    weeks.push({
      key: formatDateKey(weekStart),
      monthLabel: monthLabelDate ? monthFormatter.format(monthLabelDate) : '',
      cells: dailyCells
    })
  }

  const maxTokens = Math.max(0, ...weeks.flatMap((week) => week.cells).map((cell) => cell?.tokenUsed ?? 0))
  return {
    weeks: weeks.map((week) => ({
      ...week,
      cells: week.cells.map((cell) => (cell ? { ...cell, level: getHeatmapLevel(cell.tokenUsed, maxTokens) } : null))
    }))
  }
}

function aggregateBuckets(buckets: IMembershipUsageBucket[]) {
  const result = new Map<string, IMembershipUsageBucket>()

  for (const bucket of buckets) {
    const dateValue = parseDateKey(bucket.date)
    if (!dateValue) {
      continue
    }

    const date = formatDateKey(dateValue)
    const current = result.get(date)
    result.set(date, {
      date,
      pointsUsed: (current?.pointsUsed ?? 0) + bucket.pointsUsed,
      tokenUsed: (current?.tokenUsed ?? 0) + normalizeTokenUsed(bucket.tokenUsed)
    })
  }

  return result
}

function normalizeTokenUsed(tokenUsed: number) {
  return Math.max(0, Math.trunc(tokenUsed))
}

function getHeatmapLevel(tokenUsed: number, maxTokens: number): MembershipUsageHeatmapLevel {
  if (tokenUsed <= 0 || maxTokens <= 0) {
    return 0
  }

  const ratio = tokenUsed / maxTokens
  if (ratio <= 0.25) {
    return 1
  }
  if (ratio <= 0.5) {
    return 2
  }
  if (ratio <= 0.75) {
    return 3
  }
  return 4
}

function getMonthLabelDate(weekStart: Date, rangeStart: Date, rangeEnd: Date, firstWeek: boolean) {
  if (firstWeek) {
    return rangeStart
  }

  for (let dayIndex = 0; dayIndex < DAYS_IN_WEEK; dayIndex++) {
    const date = addDays(weekStart, dayIndex)
    if (date.getTime() > rangeEnd.getTime()) {
      break
    }
    if (date.getTime() >= rangeStart.getTime() && date.getDate() === 1) {
      return date
    }
  }

  return null
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatDateKey(date) === value.trim() ? date : null
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function startOfWeek(date: Date) {
  const result = startOfDay(date)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
