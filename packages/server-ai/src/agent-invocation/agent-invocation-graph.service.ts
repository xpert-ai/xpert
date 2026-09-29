// Invariants: keep native checkpoint configuration and stable tool/node names.
// Authorization runs outside the child graph, including on checkpoint resume.
import { Runnable } from '@langchain/core/runnables'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { RuntimeResourcesSelection } from '@xpert-ai/contracts'
import { t } from 'i18next'
import type { RuntimeResourceService } from '../agent-plugin/runtime-resource.service'
import { collaboratorToolDeclaration } from '../xpert-agent/collaborators/collaborators.middleware'
import { nativeInvocationTool } from './graph-tool'
import type { IXpertSubAgent } from '../shared/agent/types'
import { XpertCollaborator } from '../shared/agent/xpert'
import { GetXpertWorkflowQuery } from '../xpert/queries/get-xpert-workflow.query'
import type { XpertAgentSubgraphCommand } from '../xpert-agent/commands/subgraph.command'
import { AgentInvocationRuntime } from './invocation-runtime'
import { NativeAgentCompiler } from './native-agent.compiler'
import { wrapNativeAgentInvocation } from './native-graph-adapter'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IXpert, IXpertAgent } from '@xpert-ai/contracts'
import { createHash } from 'crypto'

export interface AgentInvocationGraphScope {
    xpertId: string
    caller: Partial<IXpert>
    agentKey: string
    projectId?: string | null
    selection?: RuntimeResourcesSelection
}

export interface AgentInvocationBuildContext extends AgentInvocationGraphScope {
    agentKey: string
    options: XpertAgentSubgraphCommand['options']
    occupiedNames: Iterable<string>
}

@Injectable()
export class AgentInvocationGraphService {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @Inject('XpertRuntimeResourceService') private readonly resources: RuntimeResourceService,
        private readonly invocations: AgentInvocationRuntime,
        private readonly nativeCompiler: NativeAgentCompiler
    ) {}

    async compileExperts(experts: readonly IXpert[], context: AgentInvocationBuildContext) {
        const delegations = experts.map((target) => ({ target, tool: collaboratorToolDeclaration(target) }))
        const names = new Set(context.occupiedNames)
        for (const delegation of delegations) {
            if (names.has(delegation.tool.name))
                throw new BadRequestException(t('server-ai:Error.AgentResourceToolConflict'))
            names.add(delegation.tool.name)
        }

        const result: IXpertSubAgent[] = []
        const { options } = context
        for (const delegation of delegations) {
            const child = await XpertCollaborator.build({
                xpert: delegation.target,
                tool: delegation.tool,
                config: {
                    mute: options.mute,
                    unmutes: options.unmutes,
                    store: options.store,
                    options: {
                        leaderKey: context.agentKey,
                        isDraft: false,
                        subscriber: options.subscriber,
                        conversationId: options.conversationId,
                        projectId: options.projectId,
                        workspaceRoot: options.workspaceRoot,
                        workspacePath: options.workspacePath
                    },
                    thread_id: options.thread_id,
                    rootController: options.rootController,
                    signal: options.signal,
                    partners: options.partners,
                    isDraft: options.isDraft,
                    subscriber: options.subscriber,
                    environment: options.environment
                },
                commandBus: this.commandBus,
                queryBus: this.queryBus
            })
            result.push({
                ...child,
                stateGraph: this.wrap(child.stateGraph, context, delegation.target, child.name, options.signal, false)
            })
            options.mute?.push(
                ...(delegation.target.agentConfig?.mute ?? []).map((tags) => [delegation.target.id, ...tags])
            )
        }
        return result.map((child) => nativeInvocationTool(child.tool, child.stateGraph))
    }

    async compileLocal(
        agent: IXpertAgent,
        config: Parameters<NativeAgentCompiler['compile']>[1],
        scope: AgentInvocationGraphScope
    ) {
        const child = await this.nativeCompiler.compile(agent, config)
        return {
            ...child,
            stateGraph: this.wrap(
                child.stateGraph,
                scope,
                config.xpert,
                agent.key,
                config.signal,
                config.options.isDraft
            )
        }
    }

    private wrap<Input, Output>(
        graph: Runnable<Input, Output>,
        scope: AgentInvocationGraphScope,
        target: Partial<IXpert>,
        entry: string,
        signal: AbortSignal,
        isDraft: boolean
    ) {
        const snapshot = scope.selection ? structuredClone(scope.selection) : undefined
        const revision = createHash('sha256')
            .update(
                JSON.stringify({
                    publishAt: target.publishAt,
                    graph: target.graph,
                    // Editing an unpublished draft must not invalidate a paused published run.
                    ...(isDraft ? { draft: target.draft } : {}),
                    entry
                })
            )
            .digest('hex')
        return wrapNativeAgentInvocation(graph, this.invocations, {
            target: {
                bindingId: `xpert:${target.id}:${entry}`,
                provider: 'xpert',
                revision,
                reference: target.id,
                configuration: { entry }
            },
            scope: {
                tenantId: scope.caller.tenantId,
                organizationId: scope.caller.organizationId,
                userId: RequestContext.currentUserId(),
                workspaceId: scope.caller.workspaceId,
                projectId: scope.projectId ?? undefined,
                callerAgentKey: scope.agentKey,
                callerXpertId: scope.xpertId
            },
            signal,
            authorize: async () => {
                if (snapshot?.resources.length) await this.resources.resolve(scope.xpertId, snapshot, scope.projectId)
                if (target.id !== scope.xpertId) await this.queryBus.execute(new GetXpertWorkflowQuery(target.id))
            }
        })
    }
}
