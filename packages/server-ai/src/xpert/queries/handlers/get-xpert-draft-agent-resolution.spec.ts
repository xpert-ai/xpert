jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        getLanguageCode: jest.fn().mockReturnValue('en')
    }
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../copilot', () => ({
    CopilotGetOneQuery: class CopilotGetOneQuery {
        constructor(..._args: unknown[]) {}
    }
}))

jest.mock('../../../shared', () => ({
    isKeyEqual: (left?: string | null, right?: string | null) => Boolean(left && right && left === right)
}))

import type { QueryBus } from '@nestjs/cqrs'
import type { IXpert, IXpertAgent, TXpertTeamDraft } from '@xpert-ai/contracts'
import type { I18nService } from 'nestjs-i18n'
import type { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'
import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'
import { GetXpertAgentHandler } from './get-xpert-agent.handler'
import { GetXpertWorkflowHandler } from './get-xpert-workflow.handler'

describe('draft agent resolution', () => {
    const hiddenPrimaryAgent = {
        key: 'Agent_Primary',
        name: 'Primary',
        options: {
            hidden: true
        }
    } as IXpertAgent

    function createXpert(draft: TXpertTeamDraft) {
        return {
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            workspaceDataScope: 'user',
            graph: {
                nodes: [],
                connections: []
            },
            draft,
            agent: hiddenPrimaryAgent,
            agents: [],
            executors: []
        } as IXpert
    }

    function createDraft() {
        return {
            team: {
                agent: hiddenPrimaryAgent
            },
            nodes: [],
            connections: []
        } as TXpertTeamDraft
    }

    function createXpertService(xpert: IXpert) {
        return {
            findOne: jest.fn().mockResolvedValue(xpert),
            findOneForRuntime: jest.fn().mockResolvedValue(xpert)
        } as Partial<XpertService> as XpertService
    }

    function createQueryBus() {
        return {
            execute: jest.fn()
        } as Partial<QueryBus> as QueryBus
    }

    it('does not use hidden primary fallback for a different requested workflow agent', async () => {
        const xpert = createXpert(createDraft())
        const service = createXpertService(xpert)
        const i18nService = {
            translate: jest.fn().mockResolvedValue('No agent in graph')
        } as Partial<I18nService> as I18nService
        const handler = new GetXpertWorkflowHandler(service, i18nService, createQueryBus())

        await expect(handler.execute(new GetXpertWorkflowQuery('xpert-1', 'OtherAgent', true))).rejects.toThrow(
            'No agent in graph'
        )
    })

    it('loads an agent through runtime workspace access', async () => {
        const xpert = createXpert(createDraft())
        const service = {
            findOne: jest.fn().mockRejectedValue(new Error('authoring access path must not be used')),
            findOneForRuntime: jest.fn().mockResolvedValue(xpert)
        } as Partial<XpertService> as XpertService
        const handler = new GetXpertAgentHandler(service, createQueryBus())

        const agent = await handler.execute(new GetXpertAgentQuery('xpert-1', 'Agent_Primary', true))

        expect(agent?.key).toBe('Agent_Primary')
        expect(service.findOneForRuntime).toHaveBeenCalledWith(
            'xpert-1',
            expect.objectContaining({
                relations: expect.arrayContaining(['agent', 'toolsets', 'executors'])
            })
        )
        expect(service.findOne).not.toHaveBeenCalled()
    })

    it('uses hidden primary fallback when querying that primary agent directly', async () => {
        const xpert = createXpert(createDraft())
        const service = createXpertService(xpert)
        const handler = new GetXpertAgentHandler(service, createQueryBus())

        const agent = await handler.execute(new GetXpertAgentQuery('xpert-1', 'Agent_Primary', true))

        expect(agent?.key).toBe('Agent_Primary')
    })

    it('keeps the persisted workspace data policy on a draft agent result', async () => {
        const draft = createDraft()
        draft.team.workspaceDataScope = 'shared'
        const service = createXpertService(createXpert(draft))
        const handler = new GetXpertAgentHandler(service, createQueryBus())

        const agent = await handler.execute(new GetXpertAgentQuery('xpert-1', 'Agent_Primary', true))

        expect(agent?.team).toEqual(
            expect.objectContaining({
                workspaceId: 'workspace-1',
                workspaceDataScope: 'user'
            })
        )
    })

    it('keeps the persisted workspace data policy on a draft workflow result', async () => {
        const draft = createDraft()
        draft.team.workspaceDataScope = 'shared'
        const service = createXpertService(createXpert(draft))
        const handler = new GetXpertWorkflowHandler(
            service,
            { translate: jest.fn() } as Partial<I18nService> as I18nService,
            createQueryBus()
        )

        const result = await handler.execute(new GetXpertWorkflowQuery('xpert-1', 'Agent_Primary', true))

        expect(result.agent?.team).toEqual(
            expect.objectContaining({
                workspaceId: 'workspace-1',
                workspaceDataScope: 'user'
            })
        )
    })
})
