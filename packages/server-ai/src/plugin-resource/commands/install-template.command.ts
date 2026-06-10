import { ICommand } from '@nestjs/cqrs'
import { LanguagesEnum, TAvatar, TCopilotModel } from '@xpert-ai/contracts'

export type PluginTemplateInstallBasic = {
    name?: string
    title?: string
    description?: string
    avatar?: TAvatar
    copilotModel?: TCopilotModel
}

export class PluginTemplateInstallCommand implements ICommand {
    static readonly type = '[Plugin Resource] Install Template'

    constructor(
        public readonly templateId: string,
        public readonly workspaceId: string,
        public readonly language: LanguagesEnum,
        public readonly basic?: PluginTemplateInstallBasic
    ) {}
}
