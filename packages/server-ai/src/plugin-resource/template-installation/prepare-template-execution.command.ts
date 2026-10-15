import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { IXpert, TemplateDependencyLock, TXpertTemplate, AssistantTemplateDefinition } from '@xpert-ai/contracts'
import { TemplateReadinessService } from './template-readiness.service'
import { PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { AssistantTemplateToolsetBinder } from '../commands/assistant-template-toolset-binder.service'
import type { RuntimeResourceSkillSource } from '../../agent-plugin/runtime-resource-context'
import { containedPath } from '../../agent-plugin/agent-plugin-parser'
import { dirname } from 'node:path'

export interface PreparedTemplateExecution {
    draft: AssistantTemplateDefinition
    locks: TemplateDependencyLock[]
    skills: { [agentKey: string]: RuntimeResourceSkillSource[] }
}

export class PrepareTemplateExecutionCommand extends Command<PreparedTemplateExecution> {
    constructor(
        readonly template: TXpertTemplate,
        readonly owner: IXpert,
        readonly locks?: TemplateDependencyLock[],
        readonly projectId?: string
    ) {
        super()
    }
}

@CommandHandler(PrepareTemplateExecutionCommand)
export class PrepareTemplateExecutionHandler implements ICommandHandler<PrepareTemplateExecutionCommand> {
    constructor(
        private readonly readiness: TemplateReadinessService,
        private readonly installer: PluginResourceInstallerService,
        private readonly toolsets: AssistantTemplateToolsetBinder
    ) {}

    async execute({ template, owner, locks, projectId }: PrepareTemplateExecutionCommand) {
        const sandbox = owner.features?.sandbox
        const prepared = await this.readiness.prepareRuntime(
            template,
            owner.id,
            owner.workspaceId,
            locks,
            projectId,
            sandbox?.enabled ? sandbox.provider : undefined
        )
        const draft = structuredClone(prepared.normalized.definition)
        const installations = await this.installer.bindExistingRuntimeComponents(draft, owner, prepared.components)
        await this.toolsets.bindRuntime(draft, owner.workspaceId, prepared.normalized.dependencies)
        const skills: { [key: string]: RuntimeResourceSkillSource[] } = {}
        for (const [index, component] of prepared.components.entries()) {
            if (component.component.componentType !== 'skill') continue
            const key = component.targetAgentKey ?? draft.team.agent.key
            const rootPath = dirname(await containedPath(component.rootDir, component.component.sourcePath))
            ;(skills[key] ??= []).push({
                id: installations[index].runtimeId,
                name: component.component.componentKey,
                description: '',
                rootPath,
                runtimePath: `template-skills/${component.component.definitionHash}/${component.component.componentKey}`,
                version: component.component.definitionHash
            })
        }
        return { draft, locks: prepared.readiness.dependencies, skills }
    }
}
