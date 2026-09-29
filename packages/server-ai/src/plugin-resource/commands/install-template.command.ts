import { ICommand } from '@nestjs/cqrs'
import {
    LanguagesEnum,
    TAvatar,
    TCopilotModel,
    XpertWorkspaceDataScope,
    XpertTemplateCapability
} from '@xpert-ai/contracts'

export type PluginTemplateInstallBasic = {
    prompt?: string
    name?: string
    title?: string
    description?: string
    avatar?: TAvatar
    copilotModel?: TCopilotModel
    workspaceDataScope?: XpertWorkspaceDataScope
}

export class PluginTemplateInstallCommand implements ICommand {
    static readonly type = '[Plugin Resource] Install Template'

    constructor(
        public readonly templateId: string,
        public readonly workspaceId: string,
        public readonly language: LanguagesEnum,
        public readonly basic?: PluginTemplateInstallBasic,
        public readonly publish = false,
        public readonly locale?: string,
        public readonly capabilities: XpertTemplateCapability[] = []
    ) {}
}
