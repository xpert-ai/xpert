import './bootstrap-service.mocks'
import { ServerAIBootstrapService } from '../bootstrap.service'
import type { AssistantBindingService } from '../../assistant-binding'
import type { MembershipService } from '../../membership'
import type { ModelAccessService } from '../../model-access'
import type { ModelGatewayService } from '../../model-gateway'
import type { OrganizationCreatedEvent, PluginManagementService } from '@xpert-ai/server-core'
import { LanguagesEnum } from '@xpert-ai/contracts'

type BootstrapDependencies = ConstructorParameters<typeof ServerAIBootstrapService>
type BootstrapContextRunner = {
    runInOrganizationContext: (
        _user: unknown,
        _organizationId: string,
        callback: () => Promise<unknown>
    ) => Promise<unknown>
}

type PluginManagementServiceMock = jest.Mocked<Pick<PluginManagementService, 'findLoadedPlugin' | 'installPlugin'>>

function toPluginManagementService(mock: PluginManagementServiceMock): PluginManagementService {
    return mock as unknown as PluginManagementService
}

export function createOrganizationCreatedEvent(): OrganizationCreatedEvent {
    return {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        ownerUserId: 'owner-1'
    }
}

const defaultRepositories = {
    repositories: [
        {
            name: 'anthropics/skills',
            provider: 'github',
            options: {
                url: 'https://github.com/anthropics/skills',
                branch: 'main',
                path: 'skills'
            }
        }
    ]
}

export function createService() {
    const commandBus = {
        execute: jest.fn()
    }
    const queryBus = {
        execute: jest.fn()
    }
    const configService = {
        get: jest.fn((_key?: string) => '')
    }
    const organizationService = {
        findAll: jest.fn().mockResolvedValue({
            items: [
                {
                    id: 'org-1',
                    tenantId: 'tenant-1',
                    name: 'Acme'
                }
            ]
        }),
        findOne: jest.fn().mockResolvedValue({
            id: 'org-1',
            name: 'Acme'
        })
    }
    const userService = {
        getAdminUsers: jest.fn().mockResolvedValue([
            {
                id: 'owner-1',
                role: {
                    name: 'SUPER_ADMIN'
                }
            }
        ]),
        findOne: jest.fn().mockResolvedValue({
            id: 'owner-1',
            preferredLanguage: 'en_US'
        })
    }
    const userOrganizationService = {
        count: jest.fn().mockResolvedValue(1),
        findUserIdsByOrganization: jest.fn().mockResolvedValue(['owner-1', 'member-2'])
    }
    const workspaceService = {
        create: jest.fn().mockResolvedValue({
            id: 'workspace-1',
            ownerId: 'owner-1'
        }),
        ensureMember: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn(),
        findOrganizationDefaultWorkspace: jest.fn().mockResolvedValue(null),
        findUserDefaultWorkspace: jest.fn(),
        removeMemberFromOrganizationWorkspaces: jest.fn().mockResolvedValue(0),
        update: jest.fn()
    }
    const environmentService = {
        create: jest.fn().mockResolvedValue({
            id: 'environment-1'
        }),
        getDefaultByWorkspace: jest.fn().mockResolvedValue(null)
    }
    const skillRepositoryService = {
        findAll: jest.fn().mockResolvedValue({
            items: []
        }),
        register: jest.fn().mockResolvedValue({
            id: 'repo-1'
        }),
        ensureWorkspacePublicRepository: jest.fn().mockResolvedValue({
            id: 'repo-public',
            provider: 'workspace-public'
        })
    }
    const skillRepositoryIndexService = {
        sync: jest.fn()
    }
    const skillPackageService = {
        initializeWorkspacePublicRepository: jest.fn().mockResolvedValue({
            id: 'repo-public',
            provider: 'workspace-public'
        }),
        ensureInstalledSkillPackage: jest.fn(),
        ensureSharedSkillPackageFromTemplateBundle: jest.fn()
    }
    const xpertService = {
        repository: {
            createQueryBuilder: jest.fn()
        },
        validateName: jest.fn().mockResolvedValue(true),
        publish: jest.fn()
    }
    const xpertTemplateService = {
        getTemplateDetail: jest.fn().mockResolvedValue({
            id: 'xpert-my-claw-xpert',
            name: 'ClawXpert',
            dependencies: {
                plugins: []
            },
            export_data: 'team:\n  name: ClawXpert\n'
        }),
        readSkillRepositories: jest.fn().mockResolvedValue(defaultRepositories),
        getTemplateSkillBundles: jest.fn().mockResolvedValue([]),
        getBootstrapDefaultSkillRefs: jest.fn().mockResolvedValue([]),
        getUserDefaultSkillRefs: jest.fn().mockResolvedValue([]),
        resolveSkillRefs: jest.fn().mockResolvedValue([])
    }
    const templateSkillSyncService = {
        syncCurrentTenantSkillAssets: jest.fn().mockResolvedValue({
            mode: 'full',
            validateOnly: false,
            fingerprint: 'template-fingerprint',
            repositories: [],
            indexes: [],
            bundles: [],
            featuredRefs: [],
            workspaceDefaults: [],
            summary: {
                repositories: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
                indexes: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
                bundles: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
                featuredRefs: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 },
                workspaceDefaults: { created: 0, updated: 0, unchanged: 0, missing: 0, failed: 0 }
            }
        })
    }
    const membershipService = {
        enqueueOrganizationDefaultMembershipInitialization: jest.fn().mockResolvedValue(false),
        ensureTenantDefaultMembership: jest.fn().mockResolvedValue(null),
        ensureUserAssignedIfScopeInitialized: jest.fn().mockResolvedValue(null),
        revokeOrganizationMembershipForRemovedUser: jest.fn().mockResolvedValue(null)
    }
    const modelAccessService = {
        closeOrganizationAccessForRemovedUser: jest.fn().mockResolvedValue(undefined)
    }
    const modelGatewayService = {
        revokeOrganizationKeysForRemovedUser: jest.fn().mockResolvedValue(undefined)
    }
    const assistantBindingService = {
        getBinding: jest.fn().mockResolvedValue(null),
        getAvailableXperts: jest.fn().mockResolvedValue([]),
        upsertBinding: jest.fn()
    }
    const pluginManagementService: PluginManagementServiceMock = {
        findLoadedPlugin: jest.fn().mockReturnValue(undefined),
        installPlugin: jest.fn().mockResolvedValue({
            success: true,
            name: '@xpert-ai/plugin-file-memory',
            packageName: '@xpert-ai/plugin-file-memory',
            organizationId: 'org-1'
        })
    }

    const service = new ServerAIBootstrapService(
        configService as unknown as BootstrapDependencies[0],
        commandBus as unknown as BootstrapDependencies[1],
        queryBus as unknown as BootstrapDependencies[2],
        organizationService as unknown as BootstrapDependencies[3],
        userService as unknown as BootstrapDependencies[4],
        userOrganizationService as unknown as BootstrapDependencies[5],
        workspaceService as unknown as BootstrapDependencies[6],
        environmentService as unknown as BootstrapDependencies[7],
        skillRepositoryIndexService as unknown as BootstrapDependencies[8],
        skillPackageService as unknown as BootstrapDependencies[9],
        xpertService as unknown as BootstrapDependencies[10],
        xpertTemplateService as unknown as BootstrapDependencies[11],
        templateSkillSyncService as unknown as BootstrapDependencies[12],
        toPluginManagementService(pluginManagementService),
        assistantBindingService as unknown as AssistantBindingService,
        membershipService as unknown as MembershipService,
        modelAccessService as unknown as ModelAccessService,
        modelGatewayService as unknown as ModelGatewayService
    )

    jest.spyOn(service as unknown as BootstrapContextRunner, 'runInOrganizationContext').mockImplementation(
        async (_user: unknown, _organizationId: string, callback: () => Promise<unknown>) => callback()
    )

    return {
        assistantBindingService,
        commandBus,
        configService,
        environmentService,
        organizationService,
        queryBus,
        service,
        skillRepositoryIndexService,
        skillPackageService,
        skillRepositoryService,
        membershipService,
        modelAccessService,
        modelGatewayService,
        pluginManagementService,
        templateSkillSyncService,
        userOrganizationService,
        userService,
        workspaceService,
        xpertService,
        xpertTemplateService
    }
}

export function configureAvailableClawXpertModel({
    queryBus,
    userService,
    workspaceService,
    xpertService
}: ReturnType<typeof createService>) {
    userService.findOne.mockResolvedValue({
        id: 'member-1',
        preferredLanguage: LanguagesEnum.English,
        role: {
            name: 'ADMIN'
        }
    })
    workspaceService.findUserDefaultWorkspace.mockResolvedValue(null)
    workspaceService.create.mockResolvedValue({
        id: 'workspace-2',
        ownerId: 'member-1'
    })
    queryBus.execute.mockResolvedValue([
        {
            id: 'copilot-1',
            providerWithModels: {
                models: [
                    {
                        model: 'gpt-4o',
                        model_type: 'llm'
                    }
                ]
            }
        }
    ])
    xpertService.repository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null)
    })
}
