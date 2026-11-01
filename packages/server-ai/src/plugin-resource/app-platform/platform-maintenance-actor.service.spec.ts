import { AIPermissionsEnum, RolesEnum, UserType } from '@xpert-ai/contracts'
import { Role, RolePermission, User, UserOrganization } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformMaintenanceActorService } from './platform-maintenance-actor.service'

const provisioningPermissions = [
    AIPermissionsEnum.APPLICATION_INSTALL,
    AIPermissionsEnum.XPERT_VIEW,
    AIPermissionsEnum.XPERT_EDIT,
    AIPermissionsEnum.KNOWLEDGEBASE_EDIT
]

function fixture() {
    const row = Object.assign(new AppPlatformDelivery(), {
        id: 'delivery',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'beneficiary'
    })
    const role: Role = Object.assign(new Role(), {
        id: 'service-role',
        tenantId: 'tenant',
        name: RolesEnum.APPLICATION_PROVISIONER
    })
    const actor: User = Object.assign(new User(), {
        id: 'actor',
        tenantId: 'tenant',
        type: UserType.COMMUNICATION,
        roleId: role.id,
        role,
        isActive: true
    })
    const deliveries = {
        findOneOrFail: jest.fn().mockResolvedValue(row),
        update: jest.fn(async (_id: string, patch: Partial<AppPlatformDelivery>) => Object.assign(row, patch))
    }
    const roles = {
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn((input) => input),
        save: jest.fn(async () => {
            roles.findOneBy.mockResolvedValue(role)
            return role
        })
    }
    const grants = { save: jest.fn() }
    const users = {
        findOne: jest.fn().mockResolvedValue(actor),
        findOneOrFail: jest.fn().mockResolvedValue(actor),
        create: jest.fn((input) => input),
        save: jest.fn().mockResolvedValue(actor),
        update: jest.fn()
    }
    const memberships = {
        exists: jest.fn().mockResolvedValue(true),
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn((input) => input),
        save: jest.fn(async (input) => {
            memberships.findOneBy.mockResolvedValue(input)
            return input
        })
    }
    const manager = {
        query: jest.fn(),
        getRepository: jest.fn((entity) => {
            if (entity === AppPlatformDelivery) return deliveries
            if (entity === Role) return roles
            if (entity === RolePermission) return grants
            if (entity === User) return users
            if (entity === UserOrganization) return memberships
            throw new Error('Unexpected entity')
        })
    }
    const database = { ...manager, transaction: jest.fn(async (work) => work(manager)) }
    return {
        row,
        role,
        actor,
        deliveries,
        roles,
        grants,
        users,
        memberships,
        manager,
        service: new PlatformMaintenanceActorService(database as never)
    }
}

describe('platform initialization identities', () => {
    it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, 'custom-app-user'])(
        'authorizes the beneficiary by permissions, not role name %s',
        async (name) => {
            const f = fixture()
            const user = Object.assign(new User(), {
                id: f.row.userId,
                tenantId: 'tenant',
                roleId: 'user-role',
                isActive: true,
                role: {
                    id: 'user-role',
                    name,
                    rolePermissions: [
                        {
                            tenantId: 'tenant',
                            roleId: 'user-role',
                            permission: AIPermissionsEnum.APPLICATION_USE,
                            enabled: true
                        }
                    ]
                }
            })
            f.users.findOne.mockResolvedValue(user)
            await expect(f.service.beneficiary(f.row)).resolves.toBe(user)
            expect(f.users.findOne).toHaveBeenCalledWith({
                where: {
                    id: 'beneficiary',
                    tenantId: 'tenant',
                    type: UserType.USER,
                    emailVerified: true,
                    isActive: true
                },
                relations: ['role', 'role.rolePermissions']
            })
            expect(f.memberships.exists).toHaveBeenCalledWith({
                where: {
                    tenantId: 'tenant',
                    organizationId: 'org',
                    userId: 'beneficiary',
                    isActive: true,
                    organization: { isActive: true }
                }
            })
            f.memberships.exists.mockResolvedValue(false)
            await expect(f.service.beneficiary(f.row)).rejects.toMatchObject({
                response: { code: 'application_user_unavailable' }
            })
            f.memberships.exists.mockResolvedValue(true)
            user.role.rolePermissions[0].enabled = false
            await expect(f.service.beneficiary(f.row)).rejects.toMatchObject({
                response: { code: 'application_user_unavailable' }
            })
        }
    )

    it('rejects an absent beneficiary instead of substituting the service identity', async () => {
        const f = fixture()
        f.users.findOne.mockResolvedValue(null)
        await expect(f.service.beneficiary(f.row)).rejects.toMatchObject({
            response: { code: 'application_user_unavailable' }
        })
        expect(f.users.save).not.toHaveBeenCalled()
    })

    it('creates a non-login service identity with exactly the initialization grants and reuses it on retry', async () => {
        const f = fixture()
        await expect(f.service.ensure(f.row)).resolves.toBe(f.actor)
        await expect(f.service.ensure(f.row)).resolves.toBe(f.actor)
        expect(f.users.save).toHaveBeenCalledTimes(1)
        expect(f.roles.save).toHaveBeenCalledTimes(1)
        expect(f.memberships.save).toHaveBeenCalledTimes(1)
        expect(f.grants.save).toHaveBeenCalledWith(
            provisioningPermissions.map((permission) => ({
                tenantId: 'tenant',
                roleId: 'service-role',
                permission,
                enabled: true
            }))
        )
        expect(f.users.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                roleId: 'service-role',
                type: UserType.COMMUNICATION,
                hash: null,
                emailVerified: false
            })
        )
        expect(f.users.create.mock.calls[0][0]).not.toHaveProperty('password')
        expect(f.memberships.create).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'actor',
            isActive: true
        })
        expect(f.row.maintenanceUserId).toBe('actor')
        expect(f.deliveries.findOneOrFail).toHaveBeenCalledWith({
            where: { id: 'delivery', tenantId: 'tenant' },
            lock: { mode: 'pessimistic_write' }
        })
        expect(f.manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            'application-service-role:tenant'
        ])
    })

    it('preserves an assigned custom service role and does not restore revoked default grants', async () => {
        const f = fixture()
        f.row.maintenanceUserId = 'actor'
        f.actor.role = Object.assign(new Role(), { id: 'custom-role', name: 'custom-provisioner' })
        Object.assign(f.actor, { roleId: 'custom-role' })
        f.roles.findOneBy.mockResolvedValue(f.role)
        await f.service.ensure(f.row)
        expect(f.users.update).not.toHaveBeenCalled()
        expect(f.grants.save).not.toHaveBeenCalled()
        expect(f.users.save).not.toHaveBeenCalled()
    })

    it('migrates only a legacy AppUser technical account to the provisioning role', async () => {
        const f = fixture()
        f.row.maintenanceUserId = 'actor'
        f.actor.role = Object.assign(new Role(), { name: RolesEnum.APP_USER })
        f.roles.findOneBy.mockResolvedValue(f.role)
        await f.service.ensure(f.row)
        expect(f.users.findOne).toHaveBeenCalledWith({
            where: {
                id: 'actor',
                tenantId: 'tenant',
                type: UserType.COMMUNICATION
            },
            relations: ['role']
        })
        expect(f.users.update).toHaveBeenCalledWith('actor', { roleId: 'service-role' })
    })

    it.each(['missing', 'disabled', 'membership-disabled'])(
        'does not recreate or reactivate an invalid existing actor: %s',
        async (state) => {
            const f = fixture()
            f.row.maintenanceUserId = 'actor'
            f.roles.findOneBy.mockResolvedValue(f.role)
            if (state === 'missing') f.users.findOne.mockResolvedValue(null)
            if (state === 'disabled') f.actor.isActive = false
            if (state === 'membership-disabled') f.memberships.findOneBy.mockResolvedValue({ isActive: false })
            await expect(f.service.ensure(f.row)).rejects.toMatchObject({
                response: { code: 'application_maintenance_actor_invalid' }
            })
            expect(f.users.save).not.toHaveBeenCalled()
            expect(f.users.update).not.toHaveBeenCalled()
            expect(f.memberships.save).not.toHaveBeenCalled()
        }
    )
})
