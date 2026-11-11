import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { dirname } from 'node:path'
import { TemplateReadinessService } from '../../template-installation/template-readiness.service'
import { PluginResourceInstallerService } from '../../installation/plugin-resource-installer.service'
import { AssistantTemplateToolsetBinder } from '../assistant-template-toolset-binder.service'
import type { PreparedTemplateExecution } from '../../template-installation/template-execution.types'
import { containedPath } from '../../../agent-plugin/agent-plugin-path'
import { requirePluginResourceRoot } from '../../catalog/plugin-resource-components'
import { PrepareTemplateExecutionCommand } from '../prepare-template-execution.command'

@CommandHandler(PrepareTemplateExecutionCommand)
export class PrepareTemplateExecutionHandler implements ICommandHandler<PrepareTemplateExecutionCommand> {
    constructor(
        private readonly readiness: TemplateReadinessService,
        private readonly installer: PluginResourceInstallerService,
        private readonly toolsets: AssistantTemplateToolsetBinder
    ) {}

    async execute({ template, owner, locks, projectId }: PrepareTemplateExecutionCommand): Promise<PreparedTemplateExecution> {
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
        const skills: PreparedTemplateExecution['skills'] = {}
        for (const [index, component] of prepared.components.entries()) {
            if (component.component.componentType !== 'skill') continue
            const key = component.targetAgentKey ?? draft.team.agent.key
            // Native tool providers may omit a bundle root; file-backed skills cannot.
            const rootPath = dirname(
                await containedPath(requirePluginResourceRoot(component.rootDir), component.component.sourcePath)
            )
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
