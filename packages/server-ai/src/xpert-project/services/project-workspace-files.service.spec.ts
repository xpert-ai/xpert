import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from '../../shared/volume'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectContentService } from './project-content.service'
import { XpertProjectWorkspaceFilesService } from './project-workspace-files.service'

describe('XpertProjectWorkspaceFilesService', () => {
    let root: string
    let accessService: {
        assertCanRead: jest.Mock
        assertCanEdit: jest.Mock
    }
    let contentService: {
        initializeById: jest.Mock
        updateInstructions: jest.Mock
        writeSkillFile: jest.Mock
        deleteSkillPath: jest.Mock
    }
    let service: XpertProjectWorkspaceFilesService

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'xpert-project-files-'))
        await Promise.all([
            mkdir(path.join(root, 'skills'), { recursive: true }),
            mkdir(path.join(root, 'shared'), { recursive: true }),
            writeFile(path.join(root, 'project.md'), 'Project instructions')
        ])
        const project = { id: 'project-1', tenantId: 'tenant-1', ownerId: 'owner-1' }
        accessService = {
            assertCanRead: jest.fn().mockResolvedValue({ project }),
            assertCanEdit: jest.fn().mockResolvedValue({ project })
        }
        contentService = {
            initializeById: jest.fn().mockResolvedValue(undefined),
            updateInstructions: jest.fn(async (_projectId: string, content: string) =>
                writeFile(path.join(root, 'project.md'), content)
            ),
            writeSkillFile: jest.fn(async (_projectId: string, filePath: string, content: string) => {
                const target = path.join(root, filePath)
                await mkdir(path.dirname(target), { recursive: true })
                await writeFile(target, content)
            }),
            deleteSkillPath: jest.fn().mockResolvedValue(undefined)
        }
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            root,
            root,
            'http://localhost/project/project-1'
        )
        service = new XpertProjectWorkspaceFilesService(
            accessService as unknown as XpertProjectAccessService,
            contentService as unknown as XpertProjectContentService,
            { resolve: jest.fn().mockReturnValue(volume) }
        )
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('uses read permission and returns Project workspace files through the shared file model', async () => {
        const files = await service.list('project-1')
        const projectFile = await service.read('project-1', 'project.md')

        expect(accessService.assertCanRead).toHaveBeenCalledWith('project-1')
        expect(files.some((file) => file.filePath === 'project.md')).toBe(true)
        expect(projectFile.contents).toBe('Project instructions')
    })

    it('routes governed Project Content writes through the Project Content service', async () => {
        await service.save('project-1', 'project.md', 'Updated instructions')
        await service.save('project-1', 'skills/research/SKILL.md', '# Research')

        expect(contentService.updateInstructions).toHaveBeenCalledWith('project-1', 'Updated instructions')
        expect(contentService.writeSkillFile).toHaveBeenCalledWith(
            'project-1',
            'skills/research/SKILL.md',
            '# Research'
        )
    })

    it('edits ordinary Project files with edit permission', async () => {
        await writeFile(path.join(root, 'shared', 'notes.md'), 'Before')

        await service.save('project-1', 'shared/notes.md', 'After')

        expect(accessService.assertCanEdit).toHaveBeenCalledWith('project-1')
        await expect(readFile(path.join(root, 'shared', 'notes.md'), 'utf8')).resolves.toBe('After')
    })

    it('blocks generic upload and delete operations from bypassing Project Content rules', async () => {
        await expect(
            service.uploadToFolder('project-1', 'skills', {
                originalname: 'SKILL.md',
                buffer: Buffer.from('# Skill')
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(service.delete('project-1', 'project.md')).rejects.toBeInstanceOf(ForbiddenException)
    })
})
