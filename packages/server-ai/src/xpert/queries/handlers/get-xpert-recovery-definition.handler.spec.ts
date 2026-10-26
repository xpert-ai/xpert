import { ForbiddenException } from '@nestjs/common'
import type { IUser } from '@xpert-ai/contracts'
import { runWithCapturedRequestContext } from '../../../shared/request-context'
import { Repository } from 'typeorm'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertWorkspaceBaseService } from '../../../xpert-workspace/workspace-base.service'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace/workspace-access.service'
import { threadGraphRevision } from '../../../chat-conversation/thread-graph-revision'
import { GetXpertRecoveryDefinitionQuery } from '../get-xpert-recovery-definition.query'
import { GetXpertRecoveryDefinitionHandler } from './get-xpert-recovery-definition.handler'
import { GetXpertWorkflowHandler } from './get-xpert-workflow.handler'
import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'
import { Test } from '@nestjs/testing'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { QueryHandlers } from './index'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

function fixture() {
    const xpert = Object.assign(new Xpert(), {
        id: 'assistant',
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        graph: { nodes: [], connections: [] },
        agent: { id: 'primary', key: 'primary' },
        agents: [],
        executors: [],
        copilotModel: {
            id: 'model',
            copilotId: 'copilot',
            model: 'model-a',
            modelType: 'llm',
            options: { temperature: 0.4 }
        },
        options: { position: { x: 1, y: 2 }, scale: 1, recursionLimit: 30 },
        features: { enabled: true },
        memory: { enabled: true },
        summarize: { enabled: true },
        agentConfig: { configurable: { test: true } },
        commandProfile: { commands: [] },
        environmentId: 'environment',
        workspaceDataScope: 'user'
    })
    const findOne = jest.fn().mockResolvedValue(xpert)
    const assertCan = jest
        .fn()
        .mockResolvedValue({ workspace: { id: 'workspace', tenantId: 'tenant', organizationId: 'org' } })
    // Exercise the real inherited runtime read, including tenant scoping and workspace run access.
    const service = new XpertWorkspaceBaseService(
        { findOne } as unknown as Repository<Xpert>,
        { assertCan } as unknown as XpertWorkspaceAccessService
    ) as unknown as XpertService
    const i18n = { translate: jest.fn().mockResolvedValue('No graph') } as unknown as ConstructorParameters<
        typeof GetXpertWorkflowHandler
    >[1]
    return { xpert, findOne, assertCan, service, i18n, handler: new GetXpertRecoveryDefinitionHandler(service) }
}

afterEach(() => jest.restoreAllMocks())

function scoped(work: () => Promise<void>) {
    return () =>
        runWithCapturedRequestContext(
            {
                user: { id: 'user', tenantId: 'tenant' } as IUser,
                headers: { 'organization-id': 'org', 'x-scope-level': 'organization' }
            },
            work
        )
}

it(
    'retains the workflow fingerprint while reading only scalar fields and two singular relations',
    scoped(async () => {
        const f = fixture()
        const full = await new GetXpertWorkflowHandler(f.service, f.i18n, {
            execute: jest.fn()
        } as unknown as ConstructorParameters<typeof GetXpertWorkflowHandler>[2]).execute(
            new GetXpertWorkflowQuery('assistant')
        )
        f.findOne.mockClear()
        const definition = await f.handler.execute(new GetXpertRecoveryDefinitionQuery('assistant'))
        expect(threadGraphRevision(definition.graph, undefined, definition.team)).toBe(
            threadGraphRevision(full.graph, undefined, full.agent?.team)
        )
        expect(f.assertCan).toHaveBeenLastCalledWith('workspace', 'run')
        const options = f.findOne.mock.calls[0][0]
        expect(options.where).toEqual({ id: 'assistant', tenantId: 'tenant' })
        expect(options.relations).toEqual(['agent', 'copilotModel'])
        expect(options.loadEagerRelations).toBe(false)
        expect(options.select).not.toHaveProperty('draft')
        expect(options.select).not.toHaveProperty('exportedTemplate')
        // Project the returned fields as the repository does, then check that no fingerprint input was lost.
        const projection = Object.fromEntries(
            Object.keys(options.select).map((key) => [key, Reflect.get(f.xpert, key)])
        )
        expect(threadGraphRevision(definition.graph, undefined, projection)).toBe(
            threadGraphRevision(full.graph, undefined, full.agent?.team)
        )
    })
)

it(
    'propagates denied workspace run access instead of granting a recovery definition',
    scoped(async () => {
        const f = fixture()
        f.assertCan.mockRejectedValue(new ForbiddenException())
        await expect(f.handler.execute(new GetXpertRecoveryDefinitionQuery('assistant'))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(f.assertCan).toHaveBeenCalledWith('workspace', 'run')
    })
)

it(
    'preserves absent-primary-agent semantics and rejects absent graphs',
    scoped(async () => {
        const f = fixture()
        f.findOne.mockResolvedValue({ ...f.xpert, agent: null })
        await expect(f.handler.execute(new GetXpertRecoveryDefinitionQuery('assistant'))).resolves.toEqual({
            graph: f.xpert.graph,
            team: undefined
        })
        f.findOne.mockResolvedValue({ ...f.xpert, graph: null })
        await expect(f.handler.execute(new GetXpertRecoveryDefinitionQuery('assistant'))).rejects.toThrow(
            'Graph not found'
        )
    })
)

it(
    'dispatches the registered recovery query through the owning CQRS handler',
    scoped(async () => {
        const f = fixture()
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                ...QueryHandlers.filter((handler) => handler === GetXpertRecoveryDefinitionHandler),
                { provide: XpertService, useValue: f.service }
            ]
        }).compile()
        await module.init()
        try {
            await expect(
                module.get(QueryBus).execute(new GetXpertRecoveryDefinitionQuery('assistant'))
            ).resolves.toMatchObject({ graph: f.xpert.graph })
            expect(f.assertCan).toHaveBeenCalledWith('workspace', 'run')
        } finally {
            await module.close()
        }
    })
)
