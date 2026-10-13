import { GUARDS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { CopilotController } from './copilot.controller'

describe('CopilotController', () => {
    it('keeps explicit model inference under copilot edit permission and returns no content', () => {
        const method = CopilotController.prototype.verifyPrimaryModel
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, method)).toEqual([AIPermissionsEnum.COPILOT_EDIT])
        expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([PermissionGuard])
        expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('primary/verify')
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(204)
    })

    it('keeps overview statistics under copilot edit permission', () => {
        for (const method of [
            CopilotController.prototype.getStatisticsDailyConversations,
            CopilotController.prototype.getStatisticsDailyEndUsers,
            CopilotController.prototype.getStatisticsAverageSessionInteractions,
            CopilotController.prototype.getStatisticsDailyMessages,
            CopilotController.prototype.getStatisticsTokensPerSecond,
            CopilotController.prototype.getStatisticsUserSatisfactionRate,
            CopilotController.prototype.getStatisticsTokenCost,
            CopilotController.prototype.getStatisticsModels
        ]) {
            expect(Reflect.getMetadata(PERMISSIONS_METADATA, method)).toEqual([AIPermissionsEnum.COPILOT_EDIT])
            expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([PermissionGuard])
        }
    })
})
