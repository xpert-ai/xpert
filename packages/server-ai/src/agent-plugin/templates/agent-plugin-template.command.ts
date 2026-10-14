import { Command } from '@nestjs/cqrs'
import type {
    AssistantTemplateSkillDependency,
    AssistantTemplateMcpServerDependency,
    TemplateDependencyLock,
    TXpertTemplate
} from '@xpert-ai/contracts'
import type { RuntimeComponent } from '../../plugin-resource/plugin-resource-installer.service'

/** Scope is taken from RequestContext by the package owner, never supplied by callers. */
export class AgentPluginTemplatesCommand extends Command<TXpertTemplate[]> {
    constructor(
        readonly id?: string,
        readonly language?: string,
        readonly summaryOnly = false
    ) {
        super()
    }
}

export class ResolveAgentPluginTemplateDependencyCommand extends Command<{
    component: RuntimeComponent
    lock: TemplateDependencyLock
}> {
    constructor(
        readonly kind: 'skill' | 'mcp_server',
        readonly selector: AssistantTemplateSkillDependency | AssistantTemplateMcpServerDependency,
        readonly workspaceId?: string
    ) {
        super()
    }
}

export class AssertAgentPluginTemplateDependencyCommand extends Command<void> {
    constructor(readonly lock: TemplateDependencyLock) {
        super()
    }
}

export class InstallAgentPluginTemplateResourcesCommand extends Command<
    import('../../plugin-resource/plugin-resource-installer.service').PluginResourceInstallResult
> {
    constructor(
        readonly assistant: import('@xpert-ai/contracts').IXpert,
        readonly components: RuntimeComponent[],
        readonly locks: TemplateDependencyLock[]
    ) {
        super()
    }
}
