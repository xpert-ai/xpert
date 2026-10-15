import { Query } from '@nestjs/cqrs'
import type { RuntimeResourcesSelection } from '@xpert-ai/contracts'

export class ResourceSkillInstructionsQuery extends Query<string> {
    constructor(
        readonly assistantId: string,
        readonly selection: RuntimeResourcesSelection,
        readonly references: unknown,
        readonly projectId?: string
    ) {
        super()
    }
}
