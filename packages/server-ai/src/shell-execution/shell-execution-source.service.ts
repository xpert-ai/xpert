import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ModelExecutionContext, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import {
    CliModelProfilesCapability,
    RuntimeCapabilityProvider,
    RuntimeCapabilityRegistry,
    ShellModelExecutionSourceCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { builtinCliModelProfiles } from '@xpert-ai/cli-model-profiles'
import { Repository } from 'typeorm'
import { isDeepStrictEqual } from 'node:util'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { executionError } from '../model-execution/execution-errors'
import { ShellCliExecution, ShellProcessExecution } from './shell-execution.entity'

@Injectable()
@RuntimeCapabilityProvider(ShellModelExecutionSourceCapability)
export class ShellExecutionSourceService {
    constructor(
        @InjectRepository(ShellProcessExecution) private readonly shells: Repository<ShellProcessExecution>,
        @InjectRepository(ShellCliExecution) private readonly children: Repository<ShellCliExecution>,
        @InjectRepository(XpertAgentExecution) private readonly parents: Repository<XpertAgentExecution>,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    async assertCurrent(context: ModelExecutionContext, preparing = false) {
        if (context.source.type !== 'shell_execution') throw executionError('Denied')
        const source = context.source
        const where = {
            tenantId: context.tenantId,
            organizationId: context.runtimeOrganizationId,
            ownerId: context.actorUserId
        }
        const [shell, child, parent] = await Promise.all([
            this.shells.findOneBy({ ...where, id: source.shellExecutionId }),
            this.children.findOneBy({ ...where, id: source.executionId, shellExecutionId: source.shellExecutionId }),
            this.parents.findOneBy({
                id: source.parentExecutionId,
                tenantId: context.tenantId,
                organizationId: context.runtimeOrganizationId,
                createdById: context.actorUserId
            })
        ])
        const profile = (this.capabilities.get(CliModelProfilesCapability) ?? builtinCliModelProfiles).get(
            context.tool.id
        )
        if (
            !shell ||
            !child ||
            !parent ||
            !profile ||
            context.actorUserId !== context.billableUserId ||
            shell.parentExecutionId !== parent.id ||
            parent.status !== XpertAgentExecutionStatusEnum.RUNNING ||
            !shell.runner ||
            shell.status !== 'running' ||
            shell.deadline.getTime() <= Date.now() ||
            !shell.observedAt ||
            shell.observedAt.getTime() < Date.now() - 30_000 ||
            child.generation !== source.generation ||
            shell.generation !== source.generation ||
            !isDeepStrictEqual(child.tool, context.tool) ||
            child.profileRevision !== source.profileRevision ||
            profile.revision !== source.profileRevision ||
            !(preparing ? ['preparing', 'prepared', 'starting', 'running'] : ['starting', 'running']).includes(
                child.status
            ) ||
            shell.binding.xpertId !== context.xpertId ||
            shell.binding.conversationId !== context.conversationId ||
            shell.binding.assistantVersion !== context.assistantVersion ||
            !isDeepStrictEqual(shell.binding.environment, context.environment)
        )
            throw executionError('Denied')
    }
}
