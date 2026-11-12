import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { ProjectConfigurationEditorsAdapter } from './project-configuration-editors.adapter'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectConfigurationService } from '../project-configuration.service'
import { XpertProjectMembershipService } from '../../services/project-membership.service'
import { XpertProjectInvitationService } from '../../services/project-invitation.service'
import { XpertProjectContentService } from '../../services/project-content.service'
import { XpertProjectService } from '../../project.service'
import { SkillRepositoryIndexService } from '../../../skill-repository/repository-index/skill-repository-index.service'
async function fixture() {
    const access = {
        assertIsOwner: jest.fn().mockResolvedValue({ project: { name: 'Current project' } }),
        assertCanManage: jest.fn()
    }
    const configurations = { update: jest.fn().mockRejectedValue(Error('Revision conflict')) }
    const members = {
        transferOwnership: jest.fn().mockRejectedValue(Error('owner required')),
        updateRole: jest.fn().mockRejectedValue(Error('manager required'))
    }
    const content = { uploadSkills: jest.fn().mockRejectedValue(Error('editor required')) }
    const projects = { deleteProject: jest.fn() }
    const module = await Test.createTestingModule({
        providers: [
            ProjectConfigurationEditorsAdapter,
            { provide: XpertProjectAccessService, useValue: access },
            { provide: ProjectConfigurationService, useValue: configurations },
            { provide: XpertProjectMembershipService, useValue: members },
            { provide: XpertProjectInvitationService, useValue: {} },
            { provide: XpertProjectContentService, useValue: content },
            { provide: XpertProjectService, useValue: projects },
            { provide: SkillRepositoryIndexService, useValue: {} },
            { provide: getRepositoryToken(UserOrganization), useValue: {} }
        ]
    }).compile()
    return { service: module.get(ProjectConfigurationEditorsAdapter), access, configurations, members, content, projects }
}
it('preserves configuration revision conflicts', async () => {
    const { service, configurations } = await fixture()
    await expect(service.update('project', { revision: 4, values: {} })).rejects.toThrow(
        'Revision conflict'
    )
    expect(configurations.update).toHaveBeenCalledWith('project', { revision: 4, values: {} })
    expect(configurations.update).toHaveBeenCalledTimes(1)
})
it('uses existing role/owner checks for membership mutations', async () => {
    const { service, members } = await fixture()
    const userId = '00000000-0000-4000-8000-000000000001'
    await expect(service.transferOwnership('project', { userId })).rejects.toThrow('owner required')
    await expect(service.updateMemberRole('project', { userId, role: 'manager' })).rejects.toThrow(
        'manager required'
    )
    expect(members.transferOwnership).toHaveBeenCalledWith('project', userId)
    expect(members.updateRole).toHaveBeenCalledWith('project', userId, 'manager')
})
it('requires the exact project name and owner authority before invoking lifecycle deletion', async () => {
    const { service, projects, access } = await fixture()
    await expect(service.deleteProject('project', { name: 'Other project' })).rejects.toThrow()
    expect(projects.deleteProject).not.toHaveBeenCalled()
    await service.deleteProject('project', { name: 'Current project' })
    expect(projects.deleteProject).toHaveBeenCalledWith('project')
    access.assertIsOwner.mockRejectedValue(Error('owner required'))
    await expect(service.deleteProject('project', { name: 'Current project' })).rejects.toThrow('owner required')
    expect(access.assertIsOwner).toHaveBeenCalledWith('project')
    expect(projects.deleteProject).toHaveBeenCalledTimes(1)
})
