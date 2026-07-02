import { IQuery } from '@nestjs/cqrs'
import type { PluginResourceInstallTarget } from '../plugin-resource-components'

export type PluginResourceComponentStateInput = {
    target?: PluginResourceInstallTarget
    workspaceId?: string
    xpertId?: string
    agentKey?: string
}

export class ListPluginResourceComponentStatesQuery implements IQuery {
    static readonly type = '[Plugin Resource] List Component States'

    constructor(
        public readonly pluginName: string,
        public readonly input: PluginResourceComponentStateInput
    ) {}
}
