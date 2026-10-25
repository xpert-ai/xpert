import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type {
    RuntimeResourceCommand,
    RuntimeResourceSkillReference,
    RuntimeResourcesSelection
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { dirname } from 'node:path'
import { assertAssistantAudience } from '../../ai/assistant-audience'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { containedPath } from '../agent-plugin-parser'
import { assertAgentPluginStorage, withVerifiedAgentPluginRead } from '../agent-plugin-storage-error'
import { readRuntimeResourceSkillFile } from '../runtime-resource-skill-file'
import { parseRuntimeResources } from '../runtime-resource-selection'
import { resourceSkillsSchema } from './agent-plugin-commands.schema'

@Injectable()
export class RuntimeResourceCommandsService {
    constructor(
        private readonly installations: AgentPluginInstallationsService,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus
    ) {}

    private async workspace(assistantId: string, projectId?: string) {
        assertAssistantAudience(assistantId)
        await this.commands.execute(
            projectId
                ? new AssertProjectAssistantAccessCommand(projectId, assistantId)
                : new ResolveAssistantFileAccessCommand(assistantId, 'capabilities', 'runtime')
        )
        const { agent } = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(assistantId)
        )
        if (!agent?.team?.workspaceId) throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
        return agent.team.workspaceId
    }

    /** Metadata discovery never prepares projections, installs dependencies, or reads skill bodies. */
    async list(
        assistantId: string,
        input: RuntimeResourcesSelection,
        projectId?: string
    ): Promise<RuntimeResourceCommand[]> {
        const selection = parseRuntimeResources(input)
        const workspaceId = await this.workspace(assistantId, projectId)
        const commands: RuntimeResourceCommand[] = []
        for (const ref of selection.resources) {
            const resolved = await this.installations.reference(ref, workspaceId)
            if (!resolved || resolved.pkg.descriptor.extension?.role === 'assistant') continue
            const { pkg } = resolved
            await assertAgentPluginStorage(pkg)
            for (const [skillKey, command] of Object.entries(pkg.descriptor.extension?.commands ?? {})) {
                const skill = pkg.descriptor.skills.find((item) => item.key === skillKey)
                if (skill)
                    commands.push({
                        skill: { ...ref, skillKey },
                        packageName: pkg.descriptor.name,
                        description: skill.description,
                        command
                    })
            }
        }
        return commands
    }

    /** Re-authorize every explicit activation, including queued/steered follow-ups. */
    async instructions(
        assistantId: string,
        input: RuntimeResourcesSelection,
        references: unknown,
        projectId?: string
    ): Promise<string> {
        const selection = parseRuntimeResources(input)
        const parsed = resourceSkillsSchema.safeParse(references)
        if (!parsed.success) throw new BadRequestException(t('server-ai:Error.AgentResourceInvalidSelection'))
        const workspaceId = await this.workspace(assistantId, projectId)
        const sections: string[] = []
        let size = 0
        for (const ref of parsed.data as RuntimeResourceSkillReference[]) {
            if (!selection.resources.some((item) => item.bindingId === ref.bindingId && item.version === ref.version))
                throw new ForbiddenException(t('server-ai:Error.PluginCommandSkillUnavailable'))
            const resolved = await this.installations.reference(ref, workspaceId)
            const pkg = resolved?.pkg
            const entry = pkg?.descriptor.skills.find((item) => item.key === ref.skillKey)
            if (
                !pkg ||
                !entry ||
                pkg.descriptor.extension?.role === 'assistant' ||
                !Object.prototype.hasOwnProperty.call(pkg.descriptor.extension?.commands ?? {}, ref.skillKey)
            )
                throw new ForbiddenException(t('server-ai:Error.PluginCommandSkillUnavailable'))
            const body = await withVerifiedAgentPluginRead(pkg, async () => {
                const file = await containedPath(pkg.rootPath, entry.path)
                return readRuntimeResourceSkillFile(dirname(file), 'SKILL.md')
            })
            size += Buffer.byteLength(body)
            if (size > 256 * 1024) throw new BadRequestException(t('server-ai:Error.PluginCommandInstructionsTooLarge'))
            sections.push(`Selected skill: ${pkg.descriptor.name}/${ref.skillKey}\n${body}`)
        }
        return sections.join('\n\n')
    }
}
