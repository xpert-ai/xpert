import 'reflect-metadata'
import { getMetadataArgsStorage } from 'typeorm'

jest.mock('@xpert-ai/server-core', () => ({
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {}
}))

jest.mock('../core/entities/internal', () => ({
    SkillRepositoryIndex: class SkillRepositoryIndex {}
}))

jest.mock('../xpert-workspace/workspace.entity', () => ({
    XpertWorkspace: class XpertWorkspace {}
}))

import { SkillPackage } from './skill-package.entity'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

describe('SkillPackage entity', () => {
    it('inherits the publishAt column metadata', () => {
        const publishAtColumn = getMetadataArgsStorage()
            .filterColumns([SkillPackage, WorkspaceBaseEntity])
            .find(({ propertyName }) => propertyName === 'publishAt')

        expect(publishAtColumn).toMatchObject({
            propertyName: 'publishAt',
            options: expect.objectContaining({
                type: 'timestamptz',
                nullable: true
            })
        })
    })
})
