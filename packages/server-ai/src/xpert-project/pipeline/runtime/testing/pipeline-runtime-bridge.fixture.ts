import { ManagedRuntimeService } from '../../../../agent-invocation/managed/managed-runtime.service'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { DataSource } from 'typeorm'
import {
    AgentRuntimeRegistry,
    DefaultRuntimeCapabilityRegistry,
    ProjectAccessRuntimeCapability,
    type AgentRuntimeStart,
    type AgentRuntimeContext,
    type AgentRuntimeObservation,
    type AgentRuntimeHandle,
    type ProjectPipelineRuntimeAdapterRegistry,
    type ProjectPipelineRuntimeOperation
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationFactoryService } from '../../../../agent-invocation/invocation-factory.service'
import { AgentInvocationRuntime } from '../../../../agent-invocation/invocation-runtime'
import { AgentRuntimeBindingEntity, AgentInvocationEntity } from '../../../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../../../agent-invocation/typeorm-invocation.store'
import type { ProjectAccessRuntimeService } from '../../../services/project-access-runtime.service'
import { ProjectPipelineOperationEntity } from '../../persistence/pipeline.entity'
import { ProjectPipelineRuntimeBridgeService } from '../pipeline-runtime-bridge.service'
import { ProjectPipelineOperationStore } from '../pipeline-operation.store'
import { AuthorizeProjectPipelineRuntimeHandler } from '../pipeline-runtime-access.handler'
import { AuthorizeProjectPipelineRuntimeCommand } from '../pipeline-runtime-access.command'

/** Real Invocation storage and origin policy, with a deterministic non-model Runtime strategy. */
export function pipelineRuntimeBridgeFixture(
    db: DataSource,
    adapters: ProjectPipelineRuntimeAdapterRegistry,
    access: ProjectAccessRuntimeService
) {
    const registry = new AgentRuntimeRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
    const runtime = new AgentInvocationRuntime(
        new TypeOrmAgentInvocationStore(db.getRepository(AgentInvocationEntity)),
        registry
    )
    const authorize = new AuthorizeProjectPipelineRuntimeHandler(
        db.getRepository(ProjectPipelineOperationEntity),
        access
    )
    const commands = {
        execute: (command: AuthorizeProjectPipelineRuntimeCommand) => {
            if (!(command instanceof AuthorizeProjectPipelineRuntimeCommand)) throw Error('Unexpected command')
            return authorize.execute(command)
        }
    }
    const factory = new AgentInvocationFactoryService(
        db.getRepository(AgentRuntimeBindingEntity),
        {
            execute: async () => {
                throw Error('Unexpected Assistant query')
            }
        } as unknown as QueryBus,
        runtime,
        new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, access),
        { assertEnabled: jest.fn() } as unknown as ManagedRuntimeService,
        db.getRepository(AgentInvocationEntity),
        commands as unknown as CommandBus
    )
    const start = jest.fn<Promise<AgentRuntimeObservation>, [AgentRuntimeStart, AgentRuntimeContext]>()
    const inspect = jest.fn<Promise<AgentRuntimeObservation>, [AgentRuntimeHandle, AgentRuntimeContext]>()
    const cancel = jest.fn<Promise<AgentRuntimeObservation>, [AgentRuntimeHandle, AgentRuntimeContext]>()
    registry.register(
        'neutral-runtime',
        {
            capabilities: {
                completionEvidence: 1,
                background: true,
                cancellation: true,
                interactions: false,
                recovery: 'session'
            },
            start,
            inspect,
            cancel
        },
        { kind: 'builtin', scopeKey: 'builtin:global' }
    )
    const prepare = jest.fn<
        ReturnType<ProjectPipelineRuntimeOperation['prepare']>,
        Parameters<ProjectPipelineRuntimeOperation['prepare']>
    >()
    const collect = jest.fn<
        ReturnType<ProjectPipelineRuntimeOperation['collect']>,
        Parameters<ProjectPipelineRuntimeOperation['collect']>
    >()
    adapters.register(
        'runtime_operation:neutral.assess@1',
        { kind: 'runtime_operation', ref: 'neutral.assess@1', prepare, collect },
        { kind: 'builtin', scopeKey: 'builtin:global' }
    )
    const reset = () => {
        start.mockReset().mockImplementation(async (_request, context) => ({
            status: 'running',
            handle: { sessionId: context.invocationId, runId: context.invocationId }
        }))
        inspect.mockReset().mockResolvedValue({ status: 'succeeded', result: { text: 'Neutral Runtime result' } })
        cancel.mockReset().mockImplementation(async (handle, context) => ({
            status: 'cancelled',
            controlEvidence: {
                version: 1,
                source: 'provider',
                subject: { kind: 'invocation', id: context.invocationId },
                scope: 'operation',
                state: 'settled',
                outcome: 'cancelled',
                sessionId: handle.sessionId,
                runId: handle.runId,
                receiptKey: context.invocationId,
                observedAt: new Date().toISOString()
            }
        }))
        prepare.mockReset().mockResolvedValue({ prompt: 'Assess the pinned neutral input' })
        collect.mockReset().mockResolvedValue({})
    }
    reset()
    return {
        reset,
        start,
        inspect,
        cancel,
        prepare,
        collect,
        factory,
        bridge: new ProjectPipelineRuntimeBridgeService(
            db.getRepository(ProjectPipelineOperationEntity),
            factory,
            new ProjectPipelineOperationStore(db.getRepository(ProjectPipelineOperationEntity)),
            adapters
        )
    }
}
