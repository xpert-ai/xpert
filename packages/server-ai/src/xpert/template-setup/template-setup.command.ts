import { Command } from '@nestjs/cqrs'
import type { AssistantTemplateSetup, TemplateSetupUpdate } from '@xpert-ai/contracts'

/** Read or update the current user's setup for an accessible, published Assistant. */
export class AssistantTemplateSetupCommand extends Command<AssistantTemplateSetup> {
    constructor(
        readonly assistantId: string,
        readonly update?: TemplateSetupUpdate
    ) {
        super()
    }
}
