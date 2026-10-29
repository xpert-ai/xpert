jest.mock('../../shared/tag-associations', () => ({ assertValidTagAssociations: jest.fn() }))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { Xpert } from '../xpert.entity'
import { PublicationStore } from './publication-persistence'

afterEach(() => jest.restoreAllMocks())

it.each(['saveTeam', 'createBackup'] as const)(
    'removes legacy concurrency from %s without modifying the source snapshot',
    async (method) => {
        const repository = {
            create: jest.fn((entity: Partial<Xpert>) => entity),
            save: jest.fn(async (entity: Partial<Xpert>) => entity)
        }
        const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
            getRepository: jest.fn(() => repository)
        })
        const access = Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService
        const agentConfig = { recursionLimit: 40, maxConcurrency: 1, interruptBefore: ['write'] }
        const source = Object.assign(new Xpert(), {
            id: 'xpert-1',
            userGroups: [],
            agentConfig,
            draft: { team: { agentConfig }, nodes: [], connections: [] }
        })
        const snapshot = JSON.stringify(source)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')

        const saved = await new PublicationStore(manager, access, source)[method](source)

        expect(saved.agentConfig).toEqual({ recursionLimit: 40, interruptBefore: ['write'] })
        expect(saved.draft.team.agentConfig).toEqual(saved.agentConfig)
        expect(JSON.stringify(source)).toBe(snapshot)
        expect(repository.save).toHaveBeenCalledTimes(1)
    }
)
