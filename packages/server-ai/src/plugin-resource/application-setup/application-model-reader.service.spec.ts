import { Test } from '@nestjs/testing'
import { QueryBus, CommandBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BusinessAreaService } from '@xpert-ai/server-core'
import { normalizeXpertAgentConfig } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { AssistantSharingService } from '../../xpert/sharing/sharing.service'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertService } from '../../xpert/xpert.service'
import { ApplicationModelReaderService } from './application-model-reader.service'

describe('organization model reader grants', () => {
    const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'owner' }
    const workspaceId = 'workspace'
    const node = { type: 'agent', key: 'Agent_ModelReader' }
    const config = normalizeXpertAgentConfig()
    const users = ['owner', 'coworker']
    afterEach(() => jest.restoreAllMocks())
    async function fixture() {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const ws = {
            assertCanManage: jest.fn().mockResolvedValue({
                workspace: { tenantId: actor.tenantId, organizationId: actor.organizationId },
                isTenantShared: false
            })
        }
        const db = { findOneBy: jest.fn(), findOneByOrFail: jest.fn() }
        const share = jest.fn()
        const create = jest.fn()
        const publish = jest.fn()
        const mod = await Test.createTestingModule({
            providers: [
                ApplicationModelReaderService,
                { provide: XpertWorkspaceAccessService, useValue: ws },
                { provide: BusinessAreaService, useValue: { ensureApplicationArea: async (id: string) => ({ id }) } },
                {
                    provide: QueryBus,
                    useValue: { execute: async () => ({ id: 'copilot', copilotModel: { model: 'llm' } }) }
                },
                { provide: CommandBus, useValue: { execute: create } },
                { provide: XpertService, useValue: { publish } },
                { provide: AssistantSharingService, useValue: { grantUsers: share } },
                { provide: getRepositoryToken(Xpert), useValue: db }
            ]
        }).compile()
        const api = mod.get(ApplicationModelReaderService).scoped(actor, 'connection', workspaceId, users)
        return { ws, db, share, create, publish, api }
    }
    it('publishes the isolated identity with the platform default execution configuration and grants only the selected members', async () => {
        const { db, share, create, publish, api } = await fixture()
        const area = await api.area('key', 'Sample')
        const draft = { team: { agentConfig: config }, nodes: [node], connections: [] }
        create.mockImplementation(async (command) => {
            const name = command.draft.team.name
            db.findOneByOrFail.mockResolvedValue({ name, draft })
        })
        db.findOneBy.mockResolvedValueOnce(null)
        const reader = await api.prepare('resource', 'Sample')
        expect(reader.businessAreaId).toEqual(area)
        expect(publish).toHaveBeenCalledWith(reader.xpertId, false, undefined, 'Sample', undefined, area)
        const published = {
            version: '1',
            publishAt: new Date(),
            businessAreaId: area,
            graph: { nodes: [node], connections: [] },
            agentConfig: config
        }
        db.findOneBy.mockResolvedValue(published)
        await expect(api.grant('different', reader.xpertId)).rejects.toThrow()
        expect(share).not.toHaveBeenCalled()
        await api.grant('resource', reader.xpertId)
        expect(share).toHaveBeenCalledWith(reader.xpertId, users)
        share.mockClear()
        db.findOneBy.mockResolvedValue({ ...published, draft })
        await expect(api.grant('resource', reader.xpertId)).rejects.toThrow()
        expect(share).not.toHaveBeenCalled()
    })
    it('refuses a workspace from another organization before allocating an identity', async () => {
        const { api, ws, create, share } = await fixture()
        ws.assertCanManage.mockResolvedValue({ workspace: { tenantId: actor.tenantId, organizationId: 'other' } })
        await expect(api.area('key', 'Sample')).rejects.toThrow()
        expect(create).not.toHaveBeenCalled()
        expect(share).not.toHaveBeenCalled()
    })
})
