import { Command } from '@nestjs/cqrs'

/** Human grant target picker, restricted to the current caller's active groups with a Project. */
export class ListGroupGrantTargetsCommand extends Command<{
    items: Array<{ id: string; title: string; projectId: string }>
    nextOffset: number | null
}> {
    constructor(public readonly page: { offset: number; limit: number }) {
        super()
    }
}
