import type { CommandBus } from '@nestjs/cqrs'
import { RequestContext, UserPublicDTO } from '@xpert-ai/server-core'
import { instanceToPlain } from 'class-transformer'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceController } from './workspace.controller'
import type { XpertWorkspaceService } from './workspace.service'

describe('XpertWorkspaceController permission boundaries', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('routes every generic collection endpoint through the membership-aware listing', async () => {
        const service = {
            findAllMy: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            findAllMyEntities: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )

        await expect(controller.findAllWorkspaces(undefined)).resolves.toEqual({ items: [], total: 0 })
        await expect(controller.getCount()).resolves.toBe(0)
        await expect(controller.paginationWorkspaces()).resolves.toEqual({ items: [], total: 0 })

        expect(service.findAllMy).toHaveBeenCalledTimes(2)
        expect(service.findAllMyEntities).toHaveBeenCalledTimes(1)
    })

    it('returns pagination results through the safe workspace projection', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'tenant-shared-workspace',
            name: 'Shared',
            members: [
                {
                    id: 'member-1',
                    mobile: '13800000000',
                    thirdPartyId: 'third-party-user',
                    hash: 'password-hash'
                }
            ],
            environments: [
                {
                    id: 'environment-1',
                    variables: [{ name: 'API_KEY', type: 'secret', value: 'secret-value' }]
                }
            ]
        })
        const service = {
            findAllMyEntities: jest.fn().mockResolvedValue({ items: [workspace], total: 1 })
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )

        const result = await controller.paginationWorkspaces()
        const plain = instanceToPlain(result)

        expect(plain).toEqual({
            items: [expect.objectContaining({ id: 'tenant-shared-workspace', name: 'Shared' })],
            total: 1
        })
        expect(plain.items[0]).not.toHaveProperty('members')
        expect(plain.items[0]).not.toHaveProperty('environments')
    })

    it('routes update and deletion endpoints through manage-authorized service methods', async () => {
        const workspace = { id: 'workspace-1', name: 'Renamed' }
        const service = {
            updateWorkspace: jest.fn().mockResolvedValue(workspace),
            deleteWorkspace: jest.fn(),
            softRemoveWorkspace: jest.fn(),
            recoverWorkspace: jest.fn()
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )

        await controller.update('workspace-1', { name: 'Renamed' })
        await controller.delete('workspace-1')
        await controller.softRemove('workspace-1')
        await controller.softRecover('workspace-1')

        expect(service.updateWorkspace).toHaveBeenCalledWith('workspace-1', { name: 'Renamed' })
        expect(service.deleteWorkspace).toHaveBeenCalledWith('workspace-1')
        expect(service.softRemoveWorkspace).toHaveBeenCalledWith('workspace-1')
        expect(service.recoverWorkspace).toHaveBeenCalledWith('workspace-1')
    })

    it('routes create through the sanitized service boundary instead of persisting client identity fields', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const workspace = { id: 'workspace-new', name: 'Workspace' }
        const service = {
            createWorkspace: jest.fn().mockResolvedValue(workspace)
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )
        const clientInput = {
            id: 'workspace-victim',
            name: 'Workspace',
            ownerId: 'user-victim',
            tenantId: 'tenant-victim',
            settings: {
                system: { kind: 'tenant-default' as const }
            }
        }

        await expect(controller.create(clientInput)).resolves.toBe(workspace)

        expect(service.createWorkspace).toHaveBeenCalledWith(clientInput)
    })

    it('ignores requested relations and returns only the safe workspace projection', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            name: 'Workspace',
            owner: {
                id: 'owner-1',
                email: 'owner@example.com',
                hash: 'password-hash'
            },
            members: [{ id: 'member-1', hash: 'member-password-hash' }],
            environments: [
                {
                    id: 'environment-1',
                    variables: [{ name: 'API_KEY', type: 'secret', value: 'secret-value' }]
                }
            ]
        })
        const service = {
            findOne: jest.fn().mockResolvedValue(workspace)
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )

        const result = await controller.getOne('workspace-1')
        const plain = instanceToPlain(result)

        expect(service.findOne).toHaveBeenCalledWith('workspace-1', { relations: ['owner'] })
        expect(plain).toEqual(
            expect.objectContaining({
                id: 'workspace-1',
                name: 'Workspace',
                owner: {
                    id: 'owner-1',
                    email: 'owner@example.com'
                }
            })
        )
        expect(plain).not.toHaveProperty('members')
        expect(plain).not.toHaveProperty('environments')
        expect(plain.owner).not.toHaveProperty('hash')
    })

    it('returns workspace members as public user DTOs', async () => {
        const service = {
            findOne: jest.fn().mockResolvedValue({
                members: [
                    {
                        id: 'member-1',
                        email: 'member@example.com',
                        hash: 'password-hash'
                    }
                ]
            })
        }
        const controller = new XpertWorkspaceController(
            service as unknown as XpertWorkspaceService,
            {} as unknown as CommandBus
        )

        const result = await controller.getMembers('workspace-1')
        const plain = instanceToPlain(result)

        expect(service.findOne).toHaveBeenCalledWith('workspace-1', { relations: ['members'] })
        expect(result[0]).toBeInstanceOf(UserPublicDTO)
        expect(plain).toEqual([{ id: 'member-1', email: 'member@example.com' }])
    })
})
