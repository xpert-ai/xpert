import { TranslateService } from '@ngx-translate/core'
import { buildHeatmapStyles } from '../../../features/chat/clawxpert/clawxpert-heatmap.utils'

type ClawXpertHeatmapCell = {
  key: string
  count: number
  title: string
  isFuture: boolean
  background: string
  borderColor: string
  opacity: number
}

type ClawXpertHeatmapWeek = {
  key: string
  monthLabel: string
  cells: ClawXpertHeatmapCell[]
}

export type ClawXpertHeatmapModel = {
  weeks: ClawXpertHeatmapWeek[]
  dayLabels: string[]
  totalMessages: number
  activeDays: number
}

const HEATMAP_WEEK_COUNT = 12
const HEATMAP_DAYS_PER_WEEK = 7
const HEATMAP_DAY_LABEL_INDEXES = new Set([0, 2, 4, 6])

export function buildHeatmapModel(
  series: Array<{ date: string; count: number }>,
  locale: string,
  translate: TranslateService
): ClawXpertHeatmapModel {
  const today = startOfDay(new Date())
  const currentWeekStart = startOfWeek(today)
  const firstWeekStart = addDays(currentWeekStart, -((HEATMAP_WEEK_COUNT - 1) * HEATMAP_DAYS_PER_WEEK))
  const counts = new Map<string, number>()

  for (const item of series ?? []) {
    const dateKey = normalizeHeatmapDateKey(item?.date)
    if (!dateKey) {
      continue
    }

    counts.set(dateKey, (counts.get(dateKey) ?? 0) + Number(item.count ?? 0))
  }

  const totalMessages = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  const activeDays = Array.from(counts.values()).filter((count) => count > 0).length
  const maxCount = Math.max(0, ...counts.values())
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' })
  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  const dayLabels = Array.from({ length: HEATMAP_DAYS_PER_WEEK }, (_, dayIndex) => {
    if (!HEATMAP_DAY_LABEL_INDEXES.has(dayIndex)) {
      return ''
    }

    return dayFormatter.format(addDays(currentWeekStart, dayIndex))
  })

  const weeks = Array.from({ length: HEATMAP_WEEK_COUNT }, (_, weekIndex) => {
    const weekStart = addDays(firstWeekStart, weekIndex * HEATMAP_DAYS_PER_WEEK)
    const labelDate = getMonthLabelDate(weekStart, weekIndex === 0)

    return {
      key: formatDateKey(weekStart),
      monthLabel: labelDate ? monthFormatter.format(labelDate) : '',
      cells: Array.from({ length: HEATMAP_DAYS_PER_WEEK }, (_, dayIndex) => {
        const date = addDays(weekStart, dayIndex)
        const dateKey = formatDateKey(date)
        const count = counts.get(dateKey) ?? 0
        const isFuture = date.getTime() > today.getTime()
        const title = buildHeatmapCellTitle(date, count, isFuture, dateFormatter, translate)
        const styles = buildHeatmapStyles(maxCount > 0 ? count / maxCount : 0, isFuture)

        return {
          key: `${dateKey}-${dayIndex}`,
          count,
          title,
          isFuture,
          background: styles.background,
          borderColor: styles.borderColor,
          opacity: styles.opacity
        }
      })
    }
  })

  return {
    weeks,
    dayLabels,
    totalMessages,
    activeDays
  }
}

function buildHeatmapCellTitle(
  date: Date,
  count: number,
  isFuture: boolean,
  formatter: Intl.DateTimeFormat,
  translate: TranslateService
) {
  const formattedDate = formatter.format(date)

  if (isFuture) {
    return translate.instant('XP.Chat.ClawXpert.HeatmapCellFuture', {
      date: formattedDate,
      Default: `${formattedDate}: upcoming`
    })
  }

  if (count > 0) {
    return translate.instant('XP.Chat.ClawXpert.HeatmapCellTitle', {
      date: formattedDate,
      count,
      Default: `${formattedDate}: ${count} messages`
    })
  }

  return translate.instant('XP.Chat.ClawXpert.HeatmapCellEmpty', {
    date: formattedDate,
    Default: `${formattedDate}: 0 messages`
  })
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfDay(date)
  next.setDate(next.getDate() - next.getDay())
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getMonthLabelDate(weekStart: Date, includeWeekStart: boolean) {
  if (includeWeekStart) {
    return weekStart
  }

  for (let dayIndex = 0; dayIndex < HEATMAP_DAYS_PER_WEEK; dayIndex++) {
    const date = addDays(weekStart, dayIndex)
    if (date.getDate() === 1) {
      return date
    }
  }

  return null
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeHeatmapDateKey(value?: string | null) {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue
  }

  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return formatDateKey(date)
}
