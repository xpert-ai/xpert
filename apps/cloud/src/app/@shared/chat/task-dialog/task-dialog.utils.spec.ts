import { TaskFrequency } from '@cloud/app/@core'
import { isScheduleComplete } from './task-dialog.utils'

describe('isScheduleComplete', () => {
  it('requires both time and date for a one-time task', () => {
    expect(isScheduleComplete({ frequency: TaskFrequency.Once })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Once, time: '09:30' })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Once, date: '2026-08-28' })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Once, time: '09:30', date: '2026-08-28' })).toBe(true)
  })

  it('requires a valid time for a daily task', () => {
    expect(isScheduleComplete({ frequency: TaskFrequency.Daily, time: '24:00' })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Daily, time: '08:05' })).toBe(true)
  })

  it('requires the frequency-specific day selection', () => {
    expect(isScheduleComplete({ frequency: TaskFrequency.Weekly, time: '08:05' })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Weekly, time: '08:05', dayOfWeek: 0 })).toBe(true)
    expect(isScheduleComplete({ frequency: TaskFrequency.Monthly, time: '08:05', dayOfMonth: 32 })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Monthly, time: '08:05', dayOfMonth: 31 })).toBe(true)
  })

  it('requires a date for a yearly task', () => {
    expect(isScheduleComplete({ frequency: TaskFrequency.Yearly, time: '08:05' })).toBe(false)
    expect(isScheduleComplete({ frequency: TaskFrequency.Yearly, time: '08:05', date: '2026-08-28' })).toBe(true)
  })
})
