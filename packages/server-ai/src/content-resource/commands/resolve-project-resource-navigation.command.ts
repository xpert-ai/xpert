import { Command } from '@nestjs/cqrs'
import type { IconDefinition } from '@xpert-ai/contracts'
import type { ConversationResourceScope, ContentEditorsApi } from '@xpert-ai/plugin-sdk'

/** Reauthorize a Project catalog target before publishing navigation; shared references use their own grant resolver. */
export class ResolveProjectResourceNavigationCommand extends Command<{
    title: string
    /** Public type icon from the resource's registered content provider, not caller-supplied metadata. */
    icon?: IconDefinition
    navigation: Awaited<ReturnType<ContentEditorsApi['resolve']>>
}> {
    constructor(
        readonly scope: ConversationResourceScope,
        readonly contentId: string
    ) {
        super()
    }
}
