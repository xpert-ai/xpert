import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { CopilotUsageController } from './copilot-usage.controller'

describe('CopilotUsageController', () => {
    it('requires model usage monitoring permission for every endpoint', () => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, CopilotUsageController)).toEqual([
            AIPermissionsEnum.MODEL_USAGE_MONITOR
        ])
        expect(Reflect.getMetadata(GUARDS_METADATA, CopilotUsageController)).toEqual([PermissionGuard])
    })
})
