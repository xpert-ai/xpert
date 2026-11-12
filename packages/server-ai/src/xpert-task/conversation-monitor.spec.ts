import { CronTime } from 'cron'
import { calendarOptions } from './calendar-options'
import { monitorCadence, monitorIsDue, nextMonitorCheck, monitorForm } from './conversation-monitor'

describe('conversation monitor cadence', () => {
    const start = new Date('2026-11-12T02:47:51Z')
    it.each([1, 7, 30, 60, 91, 120, 1440, 10080])(
        'anchors every %i minutes across hour and day boundaries',
        (intervalMinutes) => {
            const cadence = monitorCadence(intervalMinutes, start)
            const monitor = {
                source: 'menu' as const,
                notify: 'new-differences' as const,
                target: 'new_chat' as const,
                intervalMinutes,
                anchorAt: cadence.anchorAt
            }
            const due = new Date(Date.parse(cadence.anchorAt) + intervalMinutes * 60000)
            expect(nextMonitorCheck(monitor, cadence.schedule, 'Asia/Kathmandu', start.getTime())).toBe(
                due.toISOString()
            )
            expect(monitorIsDue(monitor, new Date(due.getTime() - 60000))).toBe(false)
            expect(monitorIsDue(monitor, due)).toBe(true)
            const cron = new CronTime(cadence.schedule, 'UTC')
            expect(cron.getNextDateFrom(new Date(due.getTime() - 1), 'UTC').toMillis()).toBe(due.getTime())
        }
    )
    it('rejects incorrect destinations and intervals while accepting previously issued forms', () => {
        const form = {
            name: 'Check',
            prompt: 'Compare',
            timeZone: 'UTC',
            requestId: '11111111-1111-4111-8111-111111111111',
            threadId: 'branch'
        }
        expect(monitorForm.parse(form).intervalMinutes).toBe(30)
        for (const invalid of [
            { intervalMinutes: 0 },
            { intervalMinutes: 1.3 },
            { xpertId: 'other' },
            { destination: { type: 'conversation' } },
            { destination: { type: 'new_chat', threadId: 'other' } }
        ])
            expect(monitorForm.safeParse({ ...form, ...invalid }).success).toBe(false)
    })
})

describe('independent cron schedules', () => {
    it('preserves sub-hour intervals and lists that cannot round trip through calendar options', () => {
        expect(calendarOptions('*/30 * * * *')).toBeUndefined()
        expect(calendarOptions('1,4 9 * * *')).toBeUndefined()
        expect(calendarOptions('2 9 * * 2')).toEqual({ frequency: 'Weekly', time: '09:02', dayOfWeek: 2 })
    })
})
