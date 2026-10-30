import { AIPermissionsEnum, MembershipPeriodStatusEnum, MembershipStatusEnum, RolesEnum } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { UserMembership } from './user-membership.entity'
import { MembershipPeriod } from './membership-period.entity'
import { RefreshMembershipModelPolicyCommand, RefreshMembershipModelPolicyHandler } from './refresh-membership-model-policy.command'

describe('explicit membership model policy refresh', () => {
    const oldModels = [{ provider: 'provider', model: 'old' }]
    const newModels = [{ provider: 'provider', model: 'new', copilotId: 'copilot' }]
    const frozen = { planId: 'plan', code: 'trial', includedPoints: 100, allowedModels: oldModels,
        modelMultipliers: [{ provider: 'provider', model: '*', multiplier: 2 }] }
    const plan = { ...frozen, id: 'plan', allowedModels: newModels, includedPoints: 200, modelMultipliers: [] }
    const original = { id: 'membership', tenantId: 'tenant', userId: 'beneficiary', planId: 'plan',
        plan, status: MembershipStatusEnum.Active, pointsGranted: 130, pointsUsed: 12, pointsTotalUsed: 41,
        currentPeriodStart: new Date('2026-01-01'), currentPeriodEnd: new Date('2026-01-08'), planSnapshot: frozen }
    const originalPeriod = { id: 'period', planId: 'plan', status: MembershipPeriodStatusEnum.Active,
        planSnapshot: frozen, pointsGranted: 130, pointsUsed: 12 }
    const users = { findOne: jest.fn() }
    const memberships = { findOne: jest.fn(), update: jest.fn() }
    const periods = { findOne: jest.fn(), existsBy: jest.fn(), update: jest.fn() }
    const manager = { queryRunner: { isTransactionActive: true }, connection: { options: { type: 'postgres' } }, query: jest.fn(),
        getRepository: jest.fn((entity) => entity === User ? users : entity === UserMembership ? memberships : periods) }
    const operator = (name: string) => ({ id: 'operator', tenantId: 'tenant', isActive: true, roleId: 'role',
        role: { name, rolePermissions: [{ tenantId: 'tenant', roleId: 'role', permission: AIPermissionsEnum.MEMBERSHIP_EDIT, enabled: true }] } })
    const command = () => new RefreshMembershipModelPolicyCommand({ tenantId: 'tenant', userId: 'beneficiary', actorId: 'operator', planCode: 'trial' }, manager as never)
    const handler = new RefreshMembershipModelPolicyHandler()
    beforeEach(() => {
        jest.clearAllMocks()
        manager.queryRunner.isTransactionActive = true
        users.findOne.mockResolvedValue(operator(RolesEnum.ADMIN))
        memberships.findOne.mockResolvedValue(structuredClone(original))
        periods.findOne.mockResolvedValue(structuredClone(originalPeriod))
        periods.existsBy.mockResolvedValue(false)
    })
    it('updates only current model permissions, preserving counters, dates, prices, holds and period history', async () => {
        await handler.execute(command())
        const snapshot = { ...frozen, allowedModels: newModels }
        expect(memberships.update).toHaveBeenCalledWith('membership', { planSnapshot: snapshot })
        expect(periods.update).toHaveBeenCalledWith('period', { planSnapshot: snapshot })
        expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['tenant', 'tenant-default-membership:beneficiary'])
        expect(periods.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: {
            tenantId: 'tenant', membershipId: 'membership', status: MembershipPeriodStatusEnum.Active
        } }))
        expect(manager.getRepository.mock.calls.flat()).toEqual(expect.arrayContaining([User, UserMembership, MembershipPeriod]))
        expect(manager.getRepository).toHaveBeenCalledTimes(3)
        expect(frozen.allowedModels).toEqual(oldModels)
    })
    it('refreshes an unused trial without creating a period or granting points', async () => {
        periods.findOne.mockResolvedValue(null)
        await handler.execute(command())
        expect(memberships.update).toHaveBeenCalledWith('membership', { planSnapshot: { ...frozen, allowedModels: newModels } })
        expect(periods.update).not.toHaveBeenCalled()
    })
    it.each(['operator', 'plan', 'period', 'history', 'transaction'])('refuses an invalid %s before writing', async (kind) => {
        if (kind === 'operator') users.findOne.mockResolvedValue({ role: { name: RolesEnum.APP_USER } })
        if (kind === 'plan') memberships.findOne.mockResolvedValue({ ...original, plan: { ...plan, code: 'different' } })
        if (kind === 'period') periods.findOne.mockResolvedValue({ ...originalPeriod, planId: 'different' })
        if (kind === 'history') { periods.findOne.mockResolvedValue(null); periods.existsBy.mockResolvedValue(true) }
        if (kind === 'transaction') manager.queryRunner.isTransactionActive = false
        await expect(handler.execute(command())).rejects.toThrow()
        expect(memberships.update).not.toHaveBeenCalled()
        expect(periods.update).not.toHaveBeenCalled()
    })

    it.each([RolesEnum.APP_USER, 'membership-operator'])('accepts role %s with an explicit membership grant', async (name) => {
        users.findOne.mockResolvedValue(operator(name))
        await handler.execute(command())
        expect(memberships.update).toHaveBeenCalledTimes(1)
    })

    it.each(['disabled', 'tenant', 'role', 'inactive', 'missing'])('rejects an invalid %s grant even for an administrator', async (kind) => {
        const actor = operator(RolesEnum.ADMIN)
        if (kind === 'disabled') actor.role.rolePermissions[0].enabled = false
        if (kind === 'tenant') actor.role.rolePermissions[0].tenantId = 'other'
        if (kind === 'role') actor.role.rolePermissions[0].roleId = 'other'
        if (kind === 'inactive') actor.isActive = false
        if (kind === 'missing') actor.role.rolePermissions = []
        users.findOne.mockResolvedValue(actor)
        await expect(handler.execute(command())).rejects.toThrow()
        expect(memberships.update).not.toHaveBeenCalled()
        expect(periods.update).not.toHaveBeenCalled()
    })
})
