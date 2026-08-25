import { GUARDS_METADATA } from '@nestjs/common/constants'
import { RolesEnum } from '@xpert-ai/contracts'
import { ROLES_METADATA } from '@xpert-ai/server-common'
import { RoleGuard } from '@xpert-ai/server-core'
import { PluginResourceController } from './plugin-resource.controller'

describe('PluginResourceController', () => {
    it('restricts organization-wide plugin installation to SUPER_ADMIN', () => {
        const handler = PluginResourceController.prototype.installOrganization

        expect(Reflect.getMetadata(ROLES_METADATA, handler)).toEqual([RolesEnum.SUPER_ADMIN])
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([RoleGuard])
    })
})
