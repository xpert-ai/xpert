import { Command } from '@nestjs/cqrs'
import type { ProjectPipelineNativeSource } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'

export type PipelineNativeGrantRequest = ProjectPipelineContext & {
    source: ProjectPipelineNativeSource
    executionId: string
    conversationId: string
    xpertId: string
    workspaceId: string
    publishedVersion: string
    inputDigest: string
}
/** Native Task transport only: pin a provider action's execution after checking its live dispatch lease and exact Assistant. */
export class AuthorizePipelineNativeExecutionCommand extends Command<void> {
    constructor(readonly input: PipelineNativeGrantRequest) {
        super()
    }
}
/** Pin an asynchronous provider task while its dispatch lease is live; preparation never starts an execution. */
export class PreparePipelineNativeExecutionCommand extends Command<void> {
    constructor(readonly input: PipelineNativeGrantRequest) {
        super()
    }
}
