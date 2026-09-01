import { IXpert } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

describe('XpertProjectXpertBindingService', () => {
    const legacyXpert = {
        id: 'xpert-v1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        type: 'agent',
        slug: 'demo',
        latest: false,
        publishAt: new Date('2026-01-01T00:00:00.000Z')
    } as IXpert
    const currentXpert = { ...legacyXpert, id: 'xpert-current', latest: true }

    it('replaces and de-duplicates historical version relations with the current Xpert', async () => {
        const project = {
            id: 'project-1',
            xperts: [legacyXpert, currentXpert]
        } as XpertProject
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue(currentXpert)
        }
        const projectRepository = {
            save: jest.fn(async (entity: XpertProject) => entity)
        }
        const service = new XpertProjectXpertBindingService(
            xpertRepository as unknown as Repository<Xpert>,
            projectRepository as unknown as Repository<XpertProject>
        )

        await expect(service.normalize(project, { persist: true })).resolves.toBe(project)

        expect(project.xperts).toEqual([currentXpert])
        expect(projectRepository.save).toHaveBeenCalledWith(project)
    })

    it('normalizes read results without rewriting the Project relation', async () => {
        const project = {
            id: 'project-1',
            xperts: [legacyXpert]
        } as XpertProject
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue(currentXpert)
        }
        const projectRepository = {
            save: jest.fn()
        }
        const service = new XpertProjectXpertBindingService(
            xpertRepository as unknown as Repository<Xpert>,
            projectRepository as unknown as Repository<XpertProject>
        )

        await expect(service.normalize(project)).resolves.toBe(project)

        expect(project.xperts).toEqual([currentXpert])
        expect(projectRepository.save).not.toHaveBeenCalled()
    })

    it('does not resolve a historical version when the current Xpert is missing', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValueOnce(legacyXpert).mockResolvedValueOnce(null)
        }
        const service = new XpertProjectXpertBindingService(
            xpertRepository as unknown as Repository<Xpert>,
            {} as Repository<XpertProject>
        )

        await expect(
            service.resolveCurrentById(legacyXpert.id, {
                tenantId: legacyXpert.tenantId,
                organizationId: legacyXpert.organizationId
            })
        ).resolves.toBeNull()
    })

    it('does not merge Xperts across Workspace or Organization boundaries', () => {
        const service = new XpertProjectXpertBindingService({} as Repository<Xpert>, {} as Repository<XpertProject>)

        expect(
            service.isSameXpert(legacyXpert, {
                ...currentXpert,
                workspaceId: 'workspace-2'
            })
        ).toBe(false)
        expect(
            service.isSameXpert(legacyXpert, {
                ...currentXpert,
                organizationId: 'org-2'
            })
        ).toBe(false)
    })
})
