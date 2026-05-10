import type { IXpert, TChatRequestHuman } from '@xpert-ai/contracts'
import { Query } from '@nestjs/cqrs'

export type PromptWorkflowInvocationResolution = {
    input: TChatRequestHuman
}

export class ResolvePromptWorkflowInvocationQuery extends Query<PromptWorkflowInvocationResolution | null> {
    static readonly type = '[Prompt Workflow] Resolve invocation'

    constructor(
        public readonly xpert: Pick<IXpert, 'id' | 'workspaceId' | 'commandProfile' | 'graph' | 'agent'>,
        public readonly input: TChatRequestHuman
    ) {
        super()
    }
}
