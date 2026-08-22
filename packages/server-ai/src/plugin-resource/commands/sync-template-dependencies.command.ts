import type { XpertTemplatePluginDependencies } from '@xpert-ai/contracts'
import type { ICommand } from '@nestjs/cqrs'

/**
 * Reconciles runtime resources declared by an Assistant template after its DSL
 * has been imported into an existing Xpert.
 */
export class PluginTemplateSyncDependenciesCommand implements ICommand {
    static readonly type = '[Plugin Resource] Sync Template Dependencies'

    constructor(
        public readonly xpertId: string,
        public readonly pluginName: string | undefined,
        public readonly dependencies: XpertTemplatePluginDependencies | undefined
    ) {}
}
