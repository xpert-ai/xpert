import { UserType } from '@xpert-ai/contracts'
import { Organization, User } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { AssistantPrincipalAccessService } from './assistant-principal-access.service'

function fixture() {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const assistant = {
        id: 'assistant',
        ...actor,
        active: true,
        latest: true,
        publishAt: new Date(),
        workspaceId: 'workspace'
    }
    const other = { ...assistant, id: 'other', userId: 'other-assistant-user' }
    const user = { id: actor.userId, tenantId: actor.tenantId, type: UserType.COMMUNICATION, isActive: true }
    const state = {
        ready: true,
        activeOrganization: true,
        project: { id: 'project', status: 'active', xperts: [assistant, other] }
    }
    const users = { findOne: jest.fn(async () => user), save: jest.fn() }
    const assistants = {
        existsBy: jest.fn(async () => true),
        findOneBy: jest.fn(async () => assistant),
        findBy: jest.fn(async () => state.project.xperts)
    }
    const database = {
        getRepository: jest.fn((entity) => {
            if (entity === Xpert) return assistants
            if (entity === User) return users
            if (entity === Organization) return { existsBy: async () => state.activeOrganization }
            if (entity === XpertProject) return { findOne: async () => state.project }
            throw new Error('Unexpected identity storage')
        })
    } as unknown as DataSource
    return {
        actor,
        assistant,
        other,
        user,
        state,
        users,
        assistants,
        access: new AssistantPrincipalAccessService(database, { isReady: () => state.ready })
    }
}

describe('Assistant principal resource access', () => {
    it('reuses Assistant.userId on every resolution without provisioning accounts', async () => {
        const f = fixture()
        expect((await f.access.find(f.actor)).user.id).toBe(f.actor.userId)
        expect((await f.access.find(f.actor)).user.id).toBe(f.actor.userId)
        expect(f.users.save).not.toHaveBeenCalled()
        expect(f.assistants.findOneBy).toHaveBeenCalledWith({ ...f.actor, latest: true })
    })
    it('restricts standalone access to the executing Assistant', async () => {
        const f = fixture()
        expect(await f.access.find(f.actor, { assistantId: 'other' })).toBeNull()
        expect(await f.access.find(f.actor, { assistantId: 'assistant' })).not.toBeNull()
    })
    it('permits Project delegation only while both Assistants remain bound', async () => {
        const f = fixture()
        expect(await f.access.find(f.actor, { projectId: 'project', assistantId: 'other' })).not.toBeNull()
        f.state.project.xperts = [f.other]
        expect(await f.access.find(f.actor, { projectId: 'project', assistantId: 'other' })).toBeNull()
    })
    it.each(['assistant', 'organization', 'account', 'project'] as const)('denies disabled %s', async (kind) => {
        const f = fixture()
        if (kind === 'assistant') f.assistant.active = false
        if (kind === 'organization') f.state.activeOrganization = false
        if (kind === 'account') f.user.isActive = false
        if (kind === 'project') f.state.project.status = 'archived'
        expect(await f.access.find(f.actor, { projectId: 'project' })).toBeNull()
    })
    it('never promotes a configuring human into an Assistant principal', async () => {
        const f = fixture()
        f.user.type = UserType.USER
        expect(await f.access.find(f.actor)).toBeNull()
    })
    it('denies execution until the host identity lifecycle is ready', async () => {
        const f = fixture()
        f.state.ready = false
        expect(await f.access.find(f.actor)).toBeNull()
        expect(f.assistants.findOneBy).not.toHaveBeenCalled()
    })
    it('requires an explicit complete organization scope', async () => {
        const f = fixture()
        expect(await f.access.find({ ...f.actor, organizationId: '' })).toBeNull()
        expect(f.assistants.findOneBy).not.toHaveBeenCalled()
    })
})
