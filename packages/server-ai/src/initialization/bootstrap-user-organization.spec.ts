import { configureAvailableClawXpertModel, createService } from './testing/bootstrap-service.fixture'
import { PluginTemplateInstallCommand } from '../plugin-resource'
import { AiModelTypeEnum, AssistantBindingScope, AssistantCode, LanguagesEnum } from '@xpert-ai/contracts'

describe('ServerAIBootstrapService member workspace lifecycle', () => {
    it('bootstraps a personal workspace for non-super-admin members', async () => {
        const { environmentService, membershipService, service, userService, workspaceService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        workspaceService.findUserDefaultWorkspace.mockResolvedValue(null)
        workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
            id: 'org-workspace-1'
        })
        workspaceService.create.mockResolvedValue({
            id: 'workspace-2',
            ownerId: 'member-1'
        })

        const result = await service.bootstrapUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1'
        })

        expect(workspaceService.findUserDefaultWorkspace).toHaveBeenCalledWith('org-1', 'member-1')
        expect(workspaceService.create).toHaveBeenCalledWith({
            name: 'User Workspace',
            status: 'active',
            ownerId: 'member-1',
            settings: {
                system: {
                    kind: 'user-default',
                    userId: 'member-1'
                }
            }
        })
        expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-2')
        expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-2', 'member-1')
        expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'member-1')
        expect(membershipService.ensureTenantDefaultMembership).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'member-1'
        })
        expect(membershipService.ensureUserAssignedIfScopeInitialized).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1',
            assignedById: 'member-1'
        })
        expect(result).toEqual({
            workspaceId: 'workspace-2',
            createdNewUserDefaultWorkspace: true
        })
    })

    it('initializes and binds ClawXpert when an LLM is available after user organization bootstrap', async () => {
        const setup = createService()
        const {
            assistantBindingService,
            commandBus,
            environmentService,
            membershipService,
            pluginManagementService,
            queryBus,
            service,
            xpertService,
            xpertTemplateService
        } = setup
        configureAvailableClawXpertModel(setup)
        xpertTemplateService.getTemplateDetail.mockResolvedValue({
            id: 'xpert-my-claw-xpert',
            name: 'ClawXpert',
            dependencies: {
                plugins: ['@xpert-ai/plugin-file-memory']
            },
            export_data: 'team:\n  name: ClawXpert\n'
        })
        commandBus.execute.mockResolvedValue({
            xpert: {
                id: 'clawxpert-1'
            }
        })
        xpertService.publish.mockResolvedValue({
            id: 'clawxpert-1'
        })
        assistantBindingService.upsertBinding.mockResolvedValue({
            assistantId: 'clawxpert-1'
        })

        await service.bootstrapUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1'
        })

        expect(membershipService.ensureUserAssignedIfScopeInitialized.mock.invocationCallOrder[0]).toBeLessThan(
            queryBus.execute.mock.invocationCallOrder[0]
        )
        expect(pluginManagementService.installPlugin).toHaveBeenCalledWith({
            pluginName: '@xpert-ai/plugin-file-memory'
        })
        expect(pluginManagementService.installPlugin.mock.invocationCallOrder[0]).toBeLessThan(
            commandBus.execute.mock.invocationCallOrder[0]
        )
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                templateId: 'xpert-my-claw-xpert',
                workspaceId: 'workspace-2',
                language: LanguagesEnum.English,
                basic: {
                    name: 'clawxpert-workspace-2',
                    title: 'ClawXpert',
                    copilotModel: {
                        copilotId: 'copilot-1',
                        model: 'gpt-4o',
                        modelType: AiModelTypeEnum.LLM
                    }
                },
                publish: false
            } satisfies Partial<PluginTemplateInstallCommand>)
        )
        expect(xpertService.publish).toHaveBeenCalledWith(
            'clawxpert-1',
            false,
            'environment-1',
            'Initial ClawXpert bootstrap release.'
        )
        expect(assistantBindingService.upsertBinding).toHaveBeenCalledWith({
            code: AssistantCode.CLAWXPERT,
            scope: AssistantBindingScope.USER,
            assistantId: 'clawxpert-1'
        })
        expect(environmentService.create).toHaveBeenCalled()
    })

    it('continues ClawXpert initialization when plugin preparation fails', async () => {
        const setup = createService()
        const {
            assistantBindingService,
            commandBus,
            pluginManagementService,
            service,
            xpertService,
            xpertTemplateService
        } = setup
        configureAvailableClawXpertModel(setup)
        xpertTemplateService.getTemplateDetail.mockResolvedValue({
            id: 'xpert-my-claw-xpert',
            name: 'ClawXpert',
            dependencies: {
                plugins: ['@xpert-ai/plugin-file-memory']
            },
            export_data: 'team:\n  name: ClawXpert\n'
        })
        pluginManagementService.installPlugin.mockRejectedValue(new Error('install failed'))
        commandBus.execute.mockResolvedValue({
            xpert: {
                id: 'clawxpert-1'
            }
        })
        xpertService.publish.mockResolvedValue({
            id: 'clawxpert-1'
        })
        assistantBindingService.upsertBinding.mockResolvedValue({
            assistantId: 'clawxpert-1'
        })

        await expect(
            service.bootstrapUserInOrganization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1'
            })
        ).resolves.toEqual({
            workspaceId: 'workspace-2',
            createdNewUserDefaultWorkspace: true
        })

        expect(pluginManagementService.installPlugin).toHaveBeenCalledWith({
            pluginName: '@xpert-ai/plugin-file-memory'
        })
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(PluginTemplateInstallCommand))
        expect(assistantBindingService.upsertBinding).toHaveBeenCalledWith({
            code: AssistantCode.CLAWXPERT,
            scope: AssistantBindingScope.USER,
            assistantId: 'clawxpert-1'
        })
    })

    it('retains ClawXpert creation failures for queue retry after membership setup', async () => {
        const setup = createService()
        const { commandBus, membershipService, service } = setup
        configureAvailableClawXpertModel(setup)
        commandBus.execute.mockRejectedValue(new Error('template install failed'))

        await expect(
            service.bootstrapUserInOrganization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1'
            })
        ).resolves.toEqual({
            workspaceId: 'workspace-2',
            createdNewUserDefaultWorkspace: true,
            clawXpertError: 'template install failed'
        })

        expect(membershipService.ensureUserAssignedIfScopeInitialized).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1',
            assignedById: 'member-1'
        })
    })

    it('skips ClawXpert initialization when no LLM is available', async () => {
        const { assistantBindingService, commandBus, queryBus, service, userService, workspaceService, xpertService } =
            createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        workspaceService.findUserDefaultWorkspace.mockResolvedValue({
            id: 'workspace-existing',
            ownerId: 'member-1'
        })
        queryBus.execute.mockResolvedValue([])

        await expect(
            service.bootstrapUserInOrganization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1'
            })
        ).resolves.toEqual({
            workspaceId: 'workspace-existing',
            createdNewUserDefaultWorkspace: false
        })

        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(PluginTemplateInstallCommand))
        expect(xpertService.publish).not.toHaveBeenCalled()
        expect(assistantBindingService.upsertBinding).not.toHaveBeenCalled()
    })

    it('assigns the tenant default membership to trial users while preserving organization assignment', async () => {
        const { membershipService, service, userService, workspaceService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'TRIAL'
            }
        })
        workspaceService.findUserDefaultWorkspace.mockResolvedValue({
            id: 'workspace-existing',
            ownerId: 'member-1'
        })

        await service.bootstrapUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1'
        })

        expect(membershipService.ensureTenantDefaultMembership).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'member-1'
        })
        expect(membershipService.ensureUserAssignedIfScopeInitialized).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1',
            assignedById: 'member-1'
        })
    })

    it('reuses an existing personal workspace without marking it as newly created', async () => {
        const { environmentService, service, userService, workspaceService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        workspaceService.findUserDefaultWorkspace.mockResolvedValue({
            id: 'workspace-existing',
            ownerId: 'member-1'
        })
        workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
            id: 'org-workspace-1'
        })

        const result = await service.bootstrapUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'member-1'
        })

        expect(workspaceService.create).not.toHaveBeenCalled()
        expect(environmentService.getDefaultByWorkspace).toHaveBeenCalledWith('workspace-existing')
        expect(workspaceService.ensureMember).toHaveBeenCalledWith('workspace-existing', 'member-1')
        expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'member-1')
        expect(result).toEqual({
            workspaceId: 'workspace-existing',
            createdNewUserDefaultWorkspace: false
        })
    })

    it('skips personal workspace bootstrap for super admins while still joining the org workspace', async () => {
        const { environmentService, membershipService, service, userService, workspaceService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'owner-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'SUPER_ADMIN'
            }
        })
        workspaceService.findOrganizationDefaultWorkspace.mockResolvedValue({
            id: 'org-workspace-1'
        })

        const result = await service.bootstrapUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'owner-1'
        })

        expect(workspaceService.findUserDefaultWorkspace).not.toHaveBeenCalled()
        expect(workspaceService.create).not.toHaveBeenCalled()
        expect(environmentService.getDefaultByWorkspace).not.toHaveBeenCalled()
        expect(workspaceService.ensureMember).toHaveBeenCalledWith('org-workspace-1', 'owner-1')
        expect(membershipService.ensureTenantDefaultMembership).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'owner-1'
        })
        expect(result).toEqual({
            workspaceId: null,
            createdNewUserDefaultWorkspace: false
        })
    })

    it('removes the user from non-personal org workspaces on membership deletion', async () => {
        const { membershipService, modelAccessService, modelGatewayService, service, workspaceService } =
            createService()

        await service.cleanupUserInOrganization({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(workspaceService.removeMemberFromOrganizationWorkspaces).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'user-1'
        )
        expect(membershipService.revokeOrganizationMembershipForRemovedUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })
        expect(modelAccessService.closeOrganizationAccessForRemovedUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })
        expect(modelGatewayService.revokeOrganizationKeysForRemovedUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })
    })
})
