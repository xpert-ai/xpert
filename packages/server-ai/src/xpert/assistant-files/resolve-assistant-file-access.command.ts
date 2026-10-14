import { Command } from '@nestjs/cqrs'
import type { XpertDataVolumeScope } from '../../shared/volume'

export type AssistantFileOperation = 'read' | 'write' | 'delete' | 'capabilities'
export type AssistantFileEntry = 'runtime' | 'authoring'

export type AssistantFileCapabilities = {
    canList: boolean
    canRead: boolean
    canWrite: boolean
    canDelete: boolean
}

export type AssistantFileAccess = {
    dependencyLocks?: import('@xpert-ai/contracts').TemplateDependencyLock[]
    initialFiles?: import('@xpert-ai/contracts').TemplateFiles
    scope: XpertDataVolumeScope
    capabilities: AssistantFileCapabilities
}

/** Resolve one Assistant's file authority; entry is chosen by trusted server code, never request data. */
export class ResolveAssistantFileAccessCommand extends Command<AssistantFileAccess> {
    constructor(
        readonly assistantId: string,
        readonly operation: AssistantFileOperation,
        readonly entry: AssistantFileEntry
    ) {
        super()
    }
}
