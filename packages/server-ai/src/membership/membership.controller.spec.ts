import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { MembershipController } from './membership.controller'

describe('MembershipController', () => {
    it('requires membership use permission for personal membership and usage endpoints', () => {
        for (const method of [
            MembershipController.prototype.getMe,
            MembershipController.prototype.getOverview,
            MembershipController.prototype.getPeriods,
            MembershipController.prototype.getUsage,
            MembershipController.prototype.getUsageSummary,
            MembershipController.prototype.getDetails
        ]) {
            expect(Reflect.getMetadata(PERMISSIONS_METADATA, method)).toEqual([AIPermissionsEnum.MEMBERSHIP_USE])
            expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([PermissionGuard])
        }
    })
})
