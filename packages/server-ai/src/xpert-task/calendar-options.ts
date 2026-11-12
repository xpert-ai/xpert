import { generateCronExpression, TaskFrequency, type TScheduleOptions } from '@xpert-ai/contracts'

// Calendar forms can represent a fixed hour and minute on a day, weekday or day of month.
export function calendarOptions(cron: string): TScheduleOptions | undefined {
    const fields = cron.trim().split(/\s+/)
    const [minute, hour, day, month, week] = fields
    if (fields.length !== 5 || !/^\d+$/.test(minute) || !/^\d+$/.test(hour) || month !== '*') return
    const time = hour.padStart(2, '0') + ':' + minute.padStart(2, '0')
    let options: TScheduleOptions
    if (day === '*' && week === '*') options = { frequency: TaskFrequency.Daily, time }
    else if (day === '*' && /^[0-6]$/.test(week))
        options = { frequency: TaskFrequency.Weekly, time, dayOfWeek: Number(week) }
    else if (week === '*' && /^\d+$/.test(day))
        options = { frequency: TaskFrequency.Monthly, time, dayOfMonth: Number(day) }
    else return
    const normalized = fields.map((field) => (/^\d+$/.test(field) ? String(Number(field)) : field)).join(' ')
    return generateCronExpression(options) === normalized ? options : undefined
}
