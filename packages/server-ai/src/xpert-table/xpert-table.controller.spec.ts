jest.mock('@xpert-ai/server-core', () => ({
    CrudController: class {},
    TransformInterceptor: class {},
    PermissionGuard: class {},
    Permissions: jest.requireActual('../../../server/src/shared/decorators/permissions').Permissions
}))
jest.mock('./xpert-table.entity', () => ({ XpertTable: class {} }))
jest.mock('./xpert-table.service', () => ({ XpertTableService: class {} }))

import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { PermissionGuard } from '@xpert-ai/server-core'
import { XpertTableController } from './xpert-table.controller'

describe('XpertTableController', () => {
    it('requires data source view permission to list selectable databases', () => {
        const handler = XpertTableController.prototype.getDatabases
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, handler)).toEqual([PermissionsEnum.DATA_SOURCE_VIEW])
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([PermissionGuard])
    })
})
