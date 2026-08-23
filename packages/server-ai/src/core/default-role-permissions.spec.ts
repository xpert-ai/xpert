import { AIPermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'

const permissionsFor = (role: RolesEnum) =>
    DEFAULT_ROLE_PERMISSIONS.find((item) => item.role === role)?.defaultEnabledPermissions ?? []

describe('AI default role permissions', () => {
    it('grants TRIAL only the selected AI permissions by default', () => {
        expect([...permissionsFor(RolesEnum.TRIAL)].sort()).toEqual(
            [
                AIPermissionsEnum.COPILOT_EDIT,
                AIPermissionsEnum.MEMBERSHIP_USE,
                AIPermissionsEnum.XPERT_EDIT,
                AIPermissionsEnum.CHAT_VIEW,
                AIPermissionsEnum.XPERT_PROJECT_VIEW,
                AIPermissionsEnum.XPERT_PROJECT_CREATE,
                AIPermissionsEnum.XPERT_PROJECT_EDIT
            ].sort()
        )
    })

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])('allows %s to administer memberships', (role) => {
        expect(permissionsFor(role)).toContain(AIPermissionsEnum.MEMBERSHIP_EDIT)
    })

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.AI_BUILDER])(
        'allows %s to monitor model usage',
        (role) => {
            expect(permissionsFor(role)).toContain(AIPermissionsEnum.MODEL_USAGE_MONITOR)
        }
    )

    it('does not allow TRIAL to monitor model usage', () => {
        expect(permissionsFor(RolesEnum.TRIAL)).not.toContain(AIPermissionsEnum.MODEL_USAGE_MONITOR)
    })

    it.each([RolesEnum.TRIAL, RolesEnum.AI_BUILDER, RolesEnum.VIEWER])(
        'does not give %s membership administration permissions',
        (role) => {
            expect(permissionsFor(role)).not.toContain(AIPermissionsEnum.MEMBERSHIP_EDIT)
        }
    )

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])('allows %s to administer model access', (role) => {
        expect(permissionsFor(role)).toEqual(
            expect.arrayContaining([
                AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW,
                AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
            ])
        )
    })

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])('allows %s to use and manage the model gateway', (role) => {
        expect(permissionsFor(role)).toEqual(
            expect.arrayContaining([AIPermissionsEnum.MODEL_GATEWAY_USE, AIPermissionsEnum.MODEL_GATEWAY_MANAGE])
        )
    })

    it.each([RolesEnum.TRIAL, RolesEnum.AI_BUILDER, RolesEnum.VIEWER])(
        'does not enable model gateway access for %s by default',
        (role) => {
            expect(permissionsFor(role)).not.toContain(AIPermissionsEnum.MODEL_GATEWAY_USE)
            expect(permissionsFor(role)).not.toContain(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
        }
    )

    it.each([RolesEnum.TRIAL, RolesEnum.AI_BUILDER, RolesEnum.VIEWER])(
        'does not give %s model access administration permissions',
        (role) => {
            expect(permissionsFor(role)).not.toContain(AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW)
            expect(permissionsFor(role)).not.toContain(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
        }
    )

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL, RolesEnum.AI_BUILDER, RolesEnum.VIEWER])(
        'allows %s to use membership plans',
        (role) => {
            expect(permissionsFor(role)).toContain(AIPermissionsEnum.MEMBERSHIP_USE)
        }
    )

    it.each([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])('allows %s to administer billing', (role) => {
        expect(permissionsFor(role)).toEqual(
            expect.arrayContaining([
                AIPermissionsEnum.BILLING_PRODUCT_EDIT,
                AIPermissionsEnum.BILLING_REFUND,
                AIPermissionsEnum.PAYMENT_PROVIDER_EDIT
            ])
        )
    })

    it.each([RolesEnum.TRIAL, RolesEnum.AI_BUILDER, RolesEnum.VIEWER])(
        'does not give %s billing administration permissions',
        (role) => {
            expect(permissionsFor(role)).not.toEqual(
                expect.arrayContaining([
                    AIPermissionsEnum.BILLING_PRODUCT_EDIT,
                    AIPermissionsEnum.BILLING_REFUND,
                    AIPermissionsEnum.PAYMENT_PROVIDER_EDIT
                ])
            )
        }
    )
})
