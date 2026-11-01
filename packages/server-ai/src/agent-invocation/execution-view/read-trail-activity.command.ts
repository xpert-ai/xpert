import { Command } from '@nestjs/cqrs'
import type { ExecutionActivityPage, XpertResolvedViewHostContext } from '@xpert-ai/contracts'

export type InvocationTrailActivity = {
    id: string
    parentExecutionId: string
    sourceToolCallId?: string
    title: string
    status: string
    activity: ExecutionActivityPage
}
/** Read bounded public activity for already-authorized parent executions; private invocation access is rechecked. */
export type TrailActivityResult = { items: InvocationTrailActivity[]; limitReached: boolean }
export class ReadTrailActivityCommand extends Command<TrailActivityResult> {
    constructor(
        public readonly context: XpertResolvedViewHostContext,
        public readonly parentExecutionIds: string[]
    ) {
        super()
    }
}
