import { ScheduleModule } from '@nestjs/schedule'

/**
 * https://docs.nestjs.com/v8/techniques/task-scheduling
 * 
 * @returns 
 */
export function provideScheduleModule() {
    return ScheduleModule.forRoot()
}