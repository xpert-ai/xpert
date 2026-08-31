import { Query } from '@nestjs/cqrs'

export type AssertFileUploadScopeInput = {
    conversationId?: string
    threadId?: string
    projectId?: string
    xpertId?: string
}

/** Authorize the final workspace scope before any external file bytes are persisted. */
export class AssertFileUploadScopeQuery extends Query<void> {
    static readonly type = '[File Understanding] Assert file upload scope'

    constructor(public readonly input: AssertFileUploadScopeInput) {
        super()
    }
}
