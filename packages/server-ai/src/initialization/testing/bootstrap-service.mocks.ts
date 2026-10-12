jest.mock('../../environment', () => ({
    EnvironmentService: class EnvironmentService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    OrganizationCreatedEvent: class OrganizationCreatedEvent {},
    OrganizationService: class OrganizationService {},
    PluginManagementService: class PluginManagementService {},
    normalizePluginName: (pluginName: string) => {
        if (!pluginName.includes('@')) return pluginName
        const lastAt = pluginName.lastIndexOf('@')
        return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName
    },
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        currentUser: jest.fn(() => null)
    },
    TenantCreatedEvent: class TenantCreatedEvent {},
    UserOrganizationCreatedEvent: class UserOrganizationCreatedEvent {},
    UserOrganizationService: class UserOrganizationService {},
    UserService: class UserService {},
    runWithRequestContext: (_context: unknown, callback: () => unknown) => callback()
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
    let currentRequest: unknown

    return {
        RequestContext: {
            currentRequest: jest.fn(() => currentRequest),
            getLanguageCode: jest.fn(
                () => (currentRequest as { headers?: { language?: string } } | null)?.headers?.language ?? 'en'
            )
        },
        runWithRequestContext: (req: unknown, _res: unknown, callback: () => unknown) => {
            currentRequest = req
            return callback()
        }
    }
})

jest.mock('../../skill-repository', () => ({
    SkillRepositoryIndexService: class SkillRepositoryIndexService {},
    SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../../skill-package', () => ({
    SkillPackageService: class SkillPackageService {}
}))

jest.mock('../../xpert', () => ({
    XpertImportCommand: class XpertImportCommand {
        constructor(
            public readonly draft: unknown,
            public readonly options?: unknown
        ) {}
    },
    XpertService: class XpertService {}
}))

jest.mock('../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../../xpert-template/template-skill-sync.service', () => ({
    TemplateSkillSyncService: class TemplateSkillSyncService {}
}))

jest.mock('../../xpert-workspace/workspace.service', () => ({
    XpertWorkspaceService: class XpertWorkspaceService {}
}))

jest.mock('../../membership', () => ({
    MembershipService: class MembershipService {}
}))

jest.mock('../../model-access', () => ({
    ModelAccessService: class ModelAccessService {}
}))

jest.mock('../../model-gateway', () => ({
    ModelGatewayService: class ModelGatewayService {}
}))

jest.mock('../../assistant-binding', () => ({
    AssistantBindingService: class AssistantBindingService {}
}))

jest.mock('../../plugin-resource', () => ({
    PluginTemplateInstallCommand: class PluginTemplateInstallCommand {
        constructor(
            public readonly templateId: string,
            public readonly workspaceId: string,
            public readonly language: string,
            public readonly basic?: unknown,
            public readonly publish = false
        ) {}
    }
}))
