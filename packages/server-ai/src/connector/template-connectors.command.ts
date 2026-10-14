import { Command } from '@nestjs/cqrs'
import type { AssistantTemplateSetup, AssistantTemplateSetupState, TemplateManifest } from '@xpert-ai/contracts'

export class ResolveTemplateConnectorsCommand extends Command<
    Pick<AssistantTemplateSetup, 'connectors' | 'managementUrl'>
> {
    constructor(
        readonly assistantId: string,
        readonly requirements: NonNullable<TemplateManifest['connectors']>,
        readonly choices: AssistantTemplateSetupState['connectors']
    ) {
        super()
    }
}
