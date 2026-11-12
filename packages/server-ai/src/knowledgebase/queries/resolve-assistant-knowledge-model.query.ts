import { Query } from '@nestjs/cqrs'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import type { OrganizationRuntimeActor } from '@xpert-ai/plugin-sdk'

/** Checks live retrieval dependencies of a published Assistant; caller retains principal and provider policy. */
export class ResolveAssistantKnowledgeModelQuery extends Query<boolean> {
    constructor(
        readonly actor: OrganizationRuntimeActor,
        readonly assistantId: string,
        readonly model: { copilotId: string; model: string; modelType: AiModelTypeEnum }
    ) {
        super()
    }
}
