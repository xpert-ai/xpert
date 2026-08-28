import { TaskFrequency, type TScheduleOptions } from '@cloud/app/@core'

export function isScheduleComplete(options?: Partial<TScheduleOptions> | null): boolean {
  const frequency = options?.frequency ?? TaskFrequency.Once

  if (!isValidTime(options?.time)) {
    return false
  }

  switch (frequency) {
    case TaskFrequency.Once:
    case TaskFrequency.Yearly:
      return !!options?.date
    case TaskFrequency.Weekly:
      return Number.isInteger(options?.dayOfWeek) && options.dayOfWeek >= 0 && options.dayOfWeek <= 6
    case TaskFrequency.Monthly:
      return Number.isInteger(options?.dayOfMonth) && options.dayOfMonth >= 1 && options.dayOfMonth <= 31
    case TaskFrequency.Daily:
      return true
    default:
      return false
  }
}

function isValidTime(time?: string): boolean {
  return typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
}
