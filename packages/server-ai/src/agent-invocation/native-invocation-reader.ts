// Native execution and checkpoint recovery belong to the graph/task adapters.
// HTTP inspection reads their persisted observation without polling or restarting them.
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentInvocation,
    ProjectAccessRuntimeCapability,
    RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { AssertXpertAgentExecutionAccessQuery } from '../xpert-agent-execution/queries/assert-access.query'
import { invocationError } from './invocation-runtime'

export function isNativeInvocation(invocation: AgentInvocation): boolean {
    const provider = invocation.request.target.provider
    return provider === 'xpert' || provider === 'xpert-task'
}

@Injectable()
export class NativeAgentInvocationReader {
    constructor(
        private readonly queries: QueryBus,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    /** The controller must first load the record in the authenticated owner's scope. */
    async inspect(invocation: AgentInvocation): Promise<AgentInvocation> {
        if (!isNativeInvocation(invocation)) throw invocationError('Unsupported')
        const {
            scope,
            request: { target }
        } = invocation
        const uuid = z.string().uuid()
        if (!uuid.safeParse(scope.callerXpertId).success || !uuid.safeParse(target.reference).success) {
            throw invocationError('InvalidRequest')
        }
        if (scope.projectId)
            await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({
                actor: { userId: scope.userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                projectId: scope.projectId
            })
        const caller = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(scope.callerXpertId)
        )
        if (
            caller.agent?.team?.tenantId !== scope.tenantId ||
            caller.agent.team.organizationId !== scope.organizationId
        ) {
            throw invocationError('InvalidScope')
        }
        // The workflow query enforces current Assistant runtime access, including
        // published external targets. Do not infer authorization from the binding string.
        const destination =
            target.reference === scope.callerXpertId
                ? caller
                : await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                      new GetXpertWorkflowQuery(target.reference)
                  )
        if (!destination.agent?.team || destination.agent.team.tenantId !== scope.tenantId) {
            throw invocationError('InvalidScope')
        }
        const workspace =
            target.provider === 'xpert-task' ? destination.agent.team.workspaceId : caller.agent.team.workspaceId
        if ((workspace ?? undefined) !== scope.workspaceId) throw invocationError('InvalidScope')
        if (target.provider === 'xpert') {
            if (!uuid.safeParse(scope.parentExecutionId).success) throw invocationError('InvalidScope')
            const parent = await this.queries.execute(new AssertXpertAgentExecutionAccessQuery(scope.parentExecutionId))
            if (parent.xpertId !== scope.callerXpertId) throw invocationError('InvalidScope')
        }
        return structuredClone(invocation)
    }
}
