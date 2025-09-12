export const ScheduleTrigger = 'schedule'

export type TScheduleTriggerConfig = {
    enabled: boolean
    cron: string
    task: string
}