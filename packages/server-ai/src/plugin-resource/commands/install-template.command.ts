import { Command } from '@nestjs/cqrs'
import type { PluginResourceInstallResult } from '../plugin-resource-installer.service'
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

/**
 * Install a template and its resources into an editable workspace, optionally publishing it.
 * Use bootstrap for a server-owned recovery flow that persists the imported Assistant ID
 * and serializes retries. Recovery identifiers and callbacks must never come from HTTP input.
 */
export class PluginTemplateInstallCommand extends Command<PluginResourceInstallResult> {
    static readonly type = '[Plugin Resource] Install Template'

    constructor(
        public readonly templateId: string,
        public readonly workspaceId: string,
        public readonly language: LanguagesEnum,
        public readonly basic?: PluginTemplateInstallBasic,
        public readonly publish = false,
        public readonly locale?: string,
        public readonly capabilities: XpertTemplateCapability[] = [],
        /** Internal resumable bootstrap; never accepted from an HTTP body. */
        public readonly bootstrap?: {
            resumeXpertId?: string
            onImported: (xpert: { id: string }) => Promise<void>
        }
    ) {
        super()
    }
}
