import { Logger } from '@nestjs/common'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Repository } from 'typeorm'
import { DevVolumeClient, VolumeClient } from '../../shared/volume'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectAsset } from '../entities/project-asset.entity'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectMilestone } from '../entities/project-milestone.entity'
import { XpertProjectPlan } from '../entities/project-plan.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectContentService } from './project-content.service'
import { XpertProjectMigrationService } from './project-migration.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

describe('XpertProjectMigrationService', () => {
    it('indexes assets only from the selected Project subtree in the default local layout', async () => {
        const originalHome = process.env.HOME
        const originalSandboxVolume = process.env.SANDBOX_VOLUME
        const originalSandboxVolumeLayout = process.env.SANDBOX_VOLUME_LAYOUT
        const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'project-asset-index-'))
        process.env.HOME = tempRoot
        delete process.env.SANDBOX_VOLUME
        delete process.env.SANDBOX_VOLUME_LAYOUT

        const volumeClient = new DevVolumeClient()
        const projectOne = {
            id: 'project-1',
            tenantId: 'tenant-1',
            ownerId: 'owner-1',
            organizationId: 'organization-1',
            createdById: 'owner-1'
        } as XpertProject
        const projectTwo = {
            id: 'project-2',
            tenantId: 'tenant-1',
            ownerId: 'owner-1',
            organizationId: 'organization-1',
            createdById: 'owner-1'
        } as XpertProject
        const projectOneVolume = await volumeClient
            .resolve({ tenantId: projectOne.tenantId, catalog: 'projects', projectId: projectOne.id })
            .ensureRoot()
        const projectTwoVolume = await volumeClient
            .resolve({ tenantId: projectTwo.tenantId, catalog: 'projects', projectId: projectTwo.id })
            .ensureRoot()
        await fsPromises.mkdir(projectOneVolume.path('shared'), { recursive: true })
        await fsPromises.mkdir(projectTwoVolume.path('shared'), { recursive: true })
        await fsPromises.writeFile(projectOneVolume.path('shared/project-one.txt'), 'one')
        await fsPromises.writeFile(projectTwoVolume.path('shared/project-two.txt'), 'two')

        const persisted: XpertProjectAsset[] = []
        const assetRepository = {
            find: jest.fn(async () => [...persisted]),
            create: jest.fn((value: XpertProjectAsset) => value),
            save: jest.fn(async (value: XpertProjectAsset) => {
                persisted.push(value)
                return value
            }),
            manager: {
                getRepository: jest.fn(() => ({
                    findOne: jest.fn().mockResolvedValue(null)
                }))
            }
        }
        const service = new XpertProjectMigrationService(
            {} as unknown as Repository<XpertProject>,
            {} as unknown as Repository<XpertProjectPlan>,
            {} as unknown as Repository<XpertProjectMilestone>,
            {} as unknown as Repository<XpertProjectTask>,
            assetRepository as unknown as Repository<XpertProjectAsset>,
            {} as unknown as Repository<XpertProjectAutomation>,
            {} as unknown as Repository<XpertProjectMembership>,
            {} as unknown as XpertProjectContentService,
            {} as unknown as XpertProjectXpertBindingService,
            volumeClient
        )

        try {
            await service.indexAssets(projectOne)

            expect(persisted.map((asset) => asset.path)).toEqual(['shared', 'shared/project-one.txt'])
            expect(persisted.some((asset) => asset.path.includes('project-two'))).toBe(false)
        } finally {
            await fsPromises.rm(tempRoot, { recursive: true, force: true })
            if (originalHome === undefined) {
                delete process.env.HOME
            } else {
                process.env.HOME = originalHome
            }
            if (originalSandboxVolume === undefined) {
                delete process.env.SANDBOX_VOLUME
            } else {
                process.env.SANDBOX_VOLUME = originalSandboxVolume
            }
            if (originalSandboxVolumeLayout === undefined) {
                delete process.env.SANDBOX_VOLUME_LAYOUT
            } else {
                process.env.SANDBOX_VOLUME_LAYOUT = originalSandboxVolumeLayout
            }
        }
    })

    it('isolates failures by Project and phase so later memberships and automation cleanup still run', async () => {
        const projects = [
            { id: 'project-1', tenantId: 'tenant-1', ownerId: 'owner-1', members: [] },
            { id: 'project-2', tenantId: 'tenant-1', ownerId: 'owner-2', members: [] }
        ] as XpertProject[]
        const projectRepository = {
            find: jest.fn().mockResolvedValue(projects)
        }
        const automationRepository = {
            update: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const contentService = {
            initialize: jest
                .fn()
                .mockRejectedValueOnce(new Error('project.md is unavailable'))
                .mockResolvedValue(undefined)
        }
        const xpertBindingService = {
            normalize: jest.fn(async (project: XpertProject) => project)
        }
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        const service = new XpertProjectMigrationService(
            projectRepository as unknown as Repository<XpertProject>,
            {} as unknown as Repository<XpertProjectPlan>,
            {} as unknown as Repository<XpertProjectMilestone>,
            {} as unknown as Repository<XpertProjectTask>,
            {} as unknown as Repository<XpertProjectAsset>,
            automationRepository as unknown as Repository<XpertProjectAutomation>,
            {} as unknown as Repository<XpertProjectMembership>,
            contentService as unknown as XpertProjectContentService,
            xpertBindingService as unknown as XpertProjectXpertBindingService,
            {} as unknown as VolumeClient
        )
        jest.spyOn(service, 'ensureDefaults').mockResolvedValue(undefined)
        const memberships = jest.spyOn(service, 'backfillMemberships').mockResolvedValue(undefined)
        jest.spyOn(service, 'normalizeTasks').mockResolvedValue(undefined)
        jest.spyOn(service, 'indexAssets')
            .mockRejectedValueOnce(new Error('volume is unavailable'))
            .mockResolvedValue(undefined)

        await expect(service.backfill()).resolves.toBe(2)

        expect(memberships).toHaveBeenNthCalledWith(1, projects[0])
        expect(memberships).toHaveBeenNthCalledWith(2, projects[1])
        expect(projectRepository.find).toHaveBeenCalledWith({ relations: ['members', 'xperts'] })
        expect(xpertBindingService.normalize).toHaveBeenNthCalledWith(1, projects[0], { persist: true })
        expect(xpertBindingService.normalize).toHaveBeenNthCalledWith(2, projects[1], { persist: true })
        expect(automationRepository.update).toHaveBeenCalledWith(
            { projectId: 'project-1', enabled: true },
            { enabled: false }
        )
        expect(automationRepository.update).toHaveBeenCalledWith(
            { projectId: 'project-2', enabled: true },
            { enabled: false }
        )
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('projectId=project-1 phase=assets'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('projectId=project-1 phase=content'))
    })
})
