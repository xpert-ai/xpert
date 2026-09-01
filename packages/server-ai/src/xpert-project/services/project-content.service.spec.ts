import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { VolumeClient, VolumeHandle } from '../../shared/volume'
import { XpertProjectContentService } from './project-content.service'

describe('XpertProjectContentService', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'xpert-project-content-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('initializes project.md from the legacy instruction once', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const access = { assertCanRead: jest.fn(), assertCanEdit: jest.fn() }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)

        await service.initialize({
            id: 'project-1',
            tenantId: 'tenant-1',
            ownerId: 'user-1',
            settings: { instruction: 'Legacy instruction' }
        } as never)
        await service.initialize({
            id: 'project-1',
            tenantId: 'tenant-1',
            ownerId: 'user-1',
            settings: { instruction: 'Must not overwrite' }
        } as never)

        await expect(readFile(path.join(root, 'project.md'), 'utf8')).resolves.toBe('Legacy instruction')
    })

    it('recognizes only project.md and the skills subtree as governed content', () => {
        expect(XpertProjectContentService.isGovernedPath('project.md')).toBe(true)
        expect(XpertProjectContentService.isGovernedPath('/skills/pdf/SKILL.md')).toBe(true)
        expect(XpertProjectContentService.isGovernedPath('shared/result.md')).toBe(false)
        expect(XpertProjectContentService.isGovernedPath('skills-old/file')).toBe(false)
    })

    it.each(['symbolic link', 'hard link'])('rejects a project.md %s during initialization', async (linkType) => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const service = new XpertProjectContentService(
            volumeClient,
            { assertCanRead: jest.fn() } as never,
            {} as never,
            {} as never
        )
        const source = path.join(root, 'legacy.md')
        await writeFile(source, 'legacy')
        if (linkType === 'symbolic link') {
            await symlink(source, path.join(root, 'project.md'))
        } else {
            await link(source, path.join(root, 'project.md'))
        }

        await expect(
            service.initialize({ id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' } as never)
        ).rejects.toThrow()
    })

    it('rejects a symlinked skills root during initialization', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const service = new XpertProjectContentService(
            volumeClient,
            { assertCanRead: jest.fn() } as never,
            {} as never,
            {} as never
        )
        const outsideSkills = path.join(root, 'legacy-skills')
        await mkdir(outsideSkills)
        await symlink(outsideSkills, path.join(root, 'skills'), 'dir')

        await expect(
            service.initialize({ id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' } as never)
        ).rejects.toThrow()
    })

    it.each(['symbolic link', 'hard link'])('rejects a Project skill tree containing a %s', async (linkType) => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = { assertCanRead: jest.fn().mockResolvedValue({ project, role: 'member' }) }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)
        await service.initialize(project as never)
        await mkdir(path.join(root, 'skills', 'unsafe'))
        const source = path.join(root, 'shared', 'source.md')
        await writeFile(source, '# Source')
        if (linkType === 'symbolic link') {
            await symlink(source, path.join(root, 'skills', 'unsafe', 'SKILL.md'))
        } else {
            await link(source, path.join(root, 'skills', 'unsafe', 'SKILL.md'))
        }

        await expect(service.listSkills('project-1')).rejects.toThrow()
    })

    it('rejects a Project skill tree containing a symlinked directory', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = { assertCanRead: jest.fn().mockResolvedValue({ project, role: 'member' }) }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)
        await service.initialize(project as never)
        const sourceDirectory = path.join(root, 'shared', 'source-skill')
        await mkdir(sourceDirectory)
        await writeFile(path.join(sourceDirectory, 'SKILL.md'), '# Source')
        await symlink(sourceDirectory, path.join(root, 'skills', 'unsafe'), 'dir')

        await expect(service.listSkills('project-1')).rejects.toThrow()
    })

    it('discovers only nested SKILL.md files from Project Content', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = {
            assertCanRead: jest.fn().mockResolvedValue({ project, role: 'member' }),
            assertCanEdit: jest.fn()
        }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)
        await mkdir(path.join(root, 'skills', 'pdf'), { recursive: true })
        await mkdir(path.join(root, 'skills', 'notes'), { recursive: true })
        await writeFile(path.join(root, 'skills', 'pdf', 'SKILL.md'), '# PDF')
        await writeFile(path.join(root, 'skills', 'notes', 'README.md'), '# ignored')

        await expect(service.listSkills('project-1')).resolves.toEqual({
            items: [
                {
                    id: 'pdf',
                    name: 'pdf',
                    path: 'skills/pdf/SKILL.md',
                    enabled: true,
                    source: 'legacy'
                }
            ],
            total: 1
        })
    })

    it('rejects Project skill authoring outside the skills directory', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const access = {
            assertCanRead: jest.fn(),
            assertCanEdit: jest.fn().mockResolvedValue({
                project: { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' },
                role: 'editor'
            })
        }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)

        await expect(service.writeSkillFile('project-1', '../outside.md', 'blocked')).rejects.toThrow()
        await expect(service.writeSkillFile('project-1', 'skills/pdf/../../../outside.md', 'blocked')).rejects.toThrow()
        await expect(
            service.writeSkillFile('project-1', 'skills/.project-skills.json', '{"version":1,"items":[]}')
        ).rejects.toThrow()
        await expect(service.deleteSkillPath('project-1', 'skills/')).rejects.toThrow()
    })

    it('allows an editor to author and delete files only inside one Project skill path', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = {
            assertCanRead: jest.fn().mockResolvedValue({ project, role: 'member' }),
            assertCanEdit: jest.fn().mockResolvedValue({ project, role: 'editor' })
        }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)

        await expect(service.writeSkillFile('project-1', 'skills/pdf/SKILL.md', '# PDF')).resolves.toEqual({
            path: 'skills/pdf/SKILL.md',
            content: '# PDF'
        })
        await expect(service.readSkillFile('project-1', 'skills/pdf/SKILL.md')).resolves.toEqual({
            path: 'skills/pdf/SKILL.md',
            content: '# PDF'
        })
        await service.deleteSkillPath('project-1', 'skills/pdf')
        await expect(readFile(path.join(root, 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
        expect(access.assertCanEdit).toHaveBeenCalledTimes(2)
    })

    it('persists the enabled state and uninstalls an installed Project skill', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = {
            assertCanRead: jest.fn().mockResolvedValue({ project, role: 'editor' }),
            assertCanEdit: jest.fn().mockResolvedValue({ project, role: 'editor' })
        }
        const service = new XpertProjectContentService(volumeClient, access as never, {} as never, {} as never)
        await service.writeSkillFile('project-1', 'skills/pdf/SKILL.md', '# PDF')

        await expect(service.setSkillEnabled('project-1', 'pdf', false)).resolves.toMatchObject({
            id: 'pdf',
            enabled: false
        })
        await expect(service.listSkills('project-1')).resolves.toMatchObject({
            items: [{ id: 'pdf', enabled: false }]
        })

        await service.uninstallSkill('project-1', 'pdf')
        await expect(service.listSkills('project-1')).resolves.toEqual({ items: [], total: 0 })
        await expect(readFile(path.join(root, 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    })

    it('stages repository installs before copying validated files into Project Content', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = { assertCanEdit: jest.fn().mockResolvedValue({ project, role: 'editor' }) }
        const installSkillPackage = jest.fn(async (_index, installDir: string) => {
            await mkdir(path.join(installDir, 'github', 'pdf'), { recursive: true })
            await writeFile(path.join(installDir, 'github', 'pdf', 'SKILL.md'), '# PDF')
            return 'github/pdf'
        })
        const service = new XpertProjectContentService(
            volumeClient,
            access as never,
            {
                findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                    id: 'index-1',
                    name: 'PDF',
                    skillPath: 'pdf',
                    repository: { provider: 'github' }
                })
            } as never,
            { get: jest.fn().mockReturnValue({ installSkillPackage }) } as never
        )

        await expect(service.installSkill('project-1', 'index-1')).resolves.toMatchObject({
            id: 'github/pdf',
            name: 'PDF',
            source: 'repository'
        })
        await expect(readFile(path.join(root, 'skills', 'github', 'pdf', 'SKILL.md'), 'utf8')).resolves.toBe('# PDF')
        expect(installSkillPackage.mock.calls[0][1]).not.toBe(path.join(root, 'skills'))
    })

    it('rejects repository installs that return a symlink outside their staging directory', async () => {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            ''
        )
        const volumeClient = { resolve: jest.fn().mockReturnValue(volume) } as unknown as VolumeClient
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'user-1' }
        const access = { assertCanEdit: jest.fn().mockResolvedValue({ project, role: 'editor' }) }
        const outside = await mkdtemp(path.join(tmpdir(), 'project-skill-outside-'))
        await writeFile(path.join(outside, 'SKILL.md'), '# Outside')
        const service = new XpertProjectContentService(
            volumeClient,
            access as never,
            {
                findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                    id: 'index-1',
                    name: 'Unsafe',
                    repository: { provider: 'github' }
                })
            } as never,
            {
                get: jest.fn().mockReturnValue({
                    installSkillPackage: async (_index, installDir: string) => {
                        await symlink(outside, path.join(installDir, 'unsafe'), 'dir')
                        return 'unsafe'
                    }
                })
            } as never
        )

        try {
            await expect(service.installSkill('project-1', 'index-1')).rejects.toThrow()
            await expect(readFile(path.join(outside, 'SKILL.md'), 'utf8')).resolves.toBe('# Outside')
            await expect(readFile(path.join(root, 'skills', 'unsafe', 'SKILL.md'), 'utf8')).rejects.toThrow()
        } finally {
            await rm(outside, { recursive: true, force: true })
        }
    })
})
