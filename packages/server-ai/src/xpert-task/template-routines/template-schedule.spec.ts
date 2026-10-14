import { taskCronExpression, cronMinuteOccurrence } from './template-schedule'
import { TaskFrequency } from '@xpert-ai/contracts'

describe('template cron scheduling', () => {
    it('uses the explicit template cron without requiring legacy schedule options', () => {
        expect(taskCronExpression({ schedule: '15 10 * * 1' })).toBe('15 10 * * 1')
        expect(taskCronExpression({ options: { frequency: TaskFrequency.Daily, time: '09:30' } })).toBe('30 9 * * *')
    })
    it('assigns delayed callbacks the correct occurrence in the selected timezone', () => {
        const task = { schedule: '15 10 * * 1', timeZone: 'Asia/Shanghai' }
        expect(cronMinuteOccurrence(task, new Date('2026-10-19T02:15:08.321Z')).toISOString()).toBe(
            '2026-10-19T02:15:00.000Z'
        )
    })
})
