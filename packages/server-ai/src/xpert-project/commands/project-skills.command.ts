import { Command } from '@nestjs/cqrs'
import type { TXpertProjectSkills } from '@xpert-ai/contracts'

/** Host-only skill operations bound to the executing Assistant's Project. */
export class ListProjectSkillsCommand extends Command<TXpertProjectSkills> {
    constructor(
        readonly projectId: string,
        readonly action: 'view' | 'edit' = 'view'
    ) {
        super()
    }
}

export class InstallProjectSkillCommand extends Command<TXpertProjectSkills['items'][number]> {
    constructor(
        readonly projectId: string,
        readonly indexId: string,
        readonly repositoryIds: string[] = []
    ) {
        super()
    }
}
