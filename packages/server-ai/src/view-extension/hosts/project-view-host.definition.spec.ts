import { AIPermissionsEnum, XpertViewHostContext } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import type { XpertProjectService } from '../../xpert-project/project.service'
import type { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { ProjectViewHostDefinition } from './project-view-host.definition'

describe('ProjectViewHostDefinition', () => {
    afterEach(() => jest.restoreAllMocks())

    it('rejects a Project view host when the caller has global view permission but is not a Project member', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockImplementation(
            (permission) => permission === AIPermissionsEnum.CHAT_VIEW
        )
        const projectAccessService = {
            assertCanRead: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const definition = new ProjectViewHostDefinition(
            {} as XpertProjectService,
            projectAccessService as unknown as XpertProjectAccessService,
            {} as never,
            {} as never
        )

        await expect(definition.canRead({ hostId: 'victim-project' } as XpertViewHostContext)).resolves.toBe(false)
        expect(projectAccessService.assertCanRead).toHaveBeenCalledWith('victim-project')
    })

    it('allows a Project member with the required global permission', async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockImplementation(
            (permission) => permission === AIPermissionsEnum.XPERT_EDIT
        )
        const projectAccessService = {
            assertCanRead: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const definition = new ProjectViewHostDefinition(
            {} as XpertProjectService,
            projectAccessService as unknown as XpertProjectAccessService,
            {} as never,
            {} as never
        )

        await expect(definition.canRead({ hostId: 'project-1' } as XpertViewHostContext)).resolves.toBe(true)
    })

    it('aggregates bound expert features and makes archived Projects read-only', async () => {
        const projectService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'project-1',
                name: 'Project One',
                status: 'archived',
                workspaceId: 'workspace-1',
                xperts: [
                    {
                        id: 'xpert-1',
                        name: 'DOCX Expert',
                        features: { docx_editor: { enabled: true } }
                    },
                    {
                        id: 'xpert-2',
                        name: 'Office Expert',
                        features: { office_editor: { enabled: true } }
                    }
                ]
            })
        }
        const projectAccessService = {
            assertCanRead: jest.fn().mockResolvedValue({ role: 'owner' })
        }
        const xpertBindingService = { normalize: jest.fn().mockResolvedValue(undefined) }
        const definition = new ProjectViewHostDefinition(
            projectService as never,
            projectAccessService as never,
            xpertBindingService as never,
            { get: jest.fn() } as never
        )

        const resolved = await definition.resolve('project-1')

        expect(xpertBindingService.normalize).toHaveBeenCalled()
        expect(resolved.context.capabilities).toEqual({
            features: ['docx_editor', 'office_editor'],
            featureProviders: {
                docx_editor: [{ xpertId: 'xpert-1', name: 'DOCX Expert' }],
                office_editor: [{ xpertId: 'xpert-2', name: 'Office Expert' }]
            }
        })
        expect(resolved.context.runtimeScope).toMatchObject({
            projectId: 'project-1',
            dataScopeKey: 'project:project-1',
            projectAccess: { role: 'owner', canRead: true, canEdit: false, canManage: false },
            workspaceFiles: { catalog: 'projects', scopeId: 'project-1', projectId: 'project-1' }
        })
    })
})
