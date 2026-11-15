jest.mock('../../services/project-content.service', () => ({ XpertProjectContentService: class {} }))
jest.mock('../../project.service', () => ({ XpertProjectService: class {} }))

import { InstallProjectSkillHandler, ListProjectSkillsHandler } from './project-skills.handler'
import { InstallProjectSkillCommand, ListProjectSkillsCommand } from '../project-skills.command'

describe('Host Project skill operations', () => {
    const content = { listSkills: jest.fn(), installSkill: jest.fn() }
    const projects = { assertToolPermission: jest.fn() }
    const list = new ListProjectSkillsHandler(content as never, projects as never)
    const install = new InstallProjectSkillHandler(content as never, projects as never)

    beforeEach(() => jest.resetAllMocks())

    it('checks view permission for listing and edit permission for discovery', async () => {
        await list.execute(new ListProjectSkillsCommand('bound-project'))
        expect(projects.assertToolPermission).toHaveBeenLastCalledWith('bound-project', 'view')
        await list.execute(new ListProjectSkillsCommand('bound-project', 'edit'))
        expect(projects.assertToolPermission).toHaveBeenLastCalledWith('bound-project', 'edit')
        expect(content.listSkills).toHaveBeenLastCalledWith('bound-project')
    })

    it('uses the non-overwriting domain installer with the configured repository scope', async () => {
        await install.execute(new InstallProjectSkillCommand('bound-project', 'index', ['allowed-repository']))
        expect(projects.assertToolPermission).toHaveBeenCalledWith('bound-project', 'edit')
        expect(content.installSkill).toHaveBeenCalledWith('bound-project', 'index', {
            onlyIfMissing: true,
            repositoryIds: ['allowed-repository']
        })
    })

    it('does not read or install after current Project permission is denied', async () => {
        projects.assertToolPermission.mockRejectedValue(new Error('Denied'))
        await expect(list.execute(new ListProjectSkillsCommand('bound-project'))).rejects.toThrow('Denied')
        await expect(install.execute(new InstallProjectSkillCommand('bound-project', 'index'))).rejects.toThrow(
            'Denied'
        )
        expect(content.listSkills).not.toHaveBeenCalled()
        expect(content.installSkill).not.toHaveBeenCalled()
    })
})
