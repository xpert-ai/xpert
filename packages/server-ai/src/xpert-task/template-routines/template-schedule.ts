import { generateCronExpression, type IXpertTask } from '@xpert-ai/contracts'
import { CronTime } from 'cron'

export function taskCronExpression(task: Pick<IXpertTask, 'schedule' | 'options'>): string {
    return task.schedule || generateCronExpression(task.options)
}

/** Five-field cron runs at minute boundaries; preserve that occurrence when callbacks are delayed. */
export function cronMinuteOccurrence(task: IXpertTask, reference: Date): Date {
    const boundary = new Date(reference)
    boundary.setSeconds(0, 0)
    const candidate = new CronTime(task.schedule, task.timeZone || 'UTC')
        .getNextDateFrom(new Date(boundary.getTime() - 1), task.timeZone || 'UTC')
        .toJSDate()
    return candidate <= reference ? candidate : reference
}
