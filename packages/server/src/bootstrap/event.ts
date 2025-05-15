import { EventEmitterModule } from '@nestjs/event-emitter'

/**
 * https://docs.nestjs.com/v8/techniques/events
 * 
 * @returns 
 */
export function provideEventEmitterModule() {
    return EventEmitterModule.forRoot()
}