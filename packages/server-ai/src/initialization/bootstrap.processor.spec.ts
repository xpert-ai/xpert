jest.mock('./bootstrap.service', () => ({
  ServerAIBootstrapService: class ServerAIBootstrapService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
  EVENT_ORGANIZATION_CREATED: 'organization.created',
  EVENT_TENANT_CREATED: 'tenant.created',
  EVENT_USER_ORGANIZATION_CREATED: 'user.organization.created',
  EVENT_USER_ORGANIZATION_DELETED: 'user.organization.deleted',
  OrganizationCreatedEvent: class OrganizationCreatedEvent {},
  TenantCreatedEvent: class TenantCreatedEvent {},
  UserOrganizationCreatedEvent: class UserOrganizationCreatedEvent {},
  UserOrganizationDeletedEvent: class UserOrganizationDeletedEvent {}
}))

import {
  AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
  AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB,
  AI_USER_DEFAULT_WORKSPACE_SKILLS_BOOTSTRAP_JOB
} from './constants'
import { ServerAIBootstrapProcessor } from './bootstrap.processor'

describe('ServerAIBootstrapProcessor', () => {
  it('enqueues tenant skill repository bootstrap jobs from tenant created events', async () => {
    const bootstrapQueue = {
      add: jest.fn().mockResolvedValue(undefined)
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1'
      }),
      bootstrapUserDefaultWorkspaceSkills: jest.fn(),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.enqueueTenantSkillRepositoryBootstrap({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    } as any)

    expect(bootstrapQueue.add).toHaveBeenCalledWith(
      AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB,
      {
        tenantId: 'tenant-1',
        tenantName: 'Acme Tenant'
      },
      {
        jobId: 'tenant-skill-repository-bootstrap:tenant-1',
        attempts: 3,
        backoff: 10_000,
        removeOnComplete: true
      }
    )
  })

  it('enqueues one async sync job per tenant-bootstrapped skill repository', async () => {
    const bootstrapQueue = {
      add: jest.fn().mockResolvedValue(undefined)
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn().mockResolvedValue({
        repositoryIds: ['repo-1', 'repo-2']
      }),
      bootstrapUserInOrganization: jest.fn(),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleTenantSkillRepositoryBootstrap({
      data: {
        tenantId: 'tenant-1',
        tenantName: 'Acme Tenant'
      }
    } as any)

    expect(bootstrapService.bootstrapTenantSkillRepositories).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantName: 'Acme Tenant'
    })
    expect(bootstrapQueue.add).toHaveBeenNthCalledWith(
      1,
      AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
      {
        tenantId: 'tenant-1',
        repositoryId: 'repo-1'
      },
      {
        jobId: 'skill-repository-sync:tenant:tenant-1:repo-1',
        attempts: 3,
        backoff: 10_000,
        removeOnComplete: true
      }
    )
    expect(bootstrapQueue.add).toHaveBeenNthCalledWith(
      2,
      AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
      {
        tenantId: 'tenant-1',
        repositoryId: 'repo-2'
      },
      {
        jobId: 'skill-repository-sync:tenant:tenant-1:repo-2',
        attempts: 3,
        backoff: 10_000,
        removeOnComplete: true
      }
    )
  })

  it('enqueues default workspace skills bootstrap after user workspace bootstrap completes', async () => {
    const bootstrapQueue = {
      add: jest.fn().mockResolvedValue(undefined)
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1'
      }),
      bootstrapUserDefaultWorkspaceSkills: jest.fn(),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleUserOrganizationBootstrap({
      data: {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1'
      }
    } as any)

    expect(bootstrapService.bootstrapUserInOrganization).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    })
    expect(bootstrapQueue.add).toHaveBeenCalledWith(
      AI_USER_DEFAULT_WORKSPACE_SKILLS_BOOTSTRAP_JOB,
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        workspaceId: 'workspace-1'
      },
      {
        jobId: 'user-default-skills:workspace-1',
        attempts: 8,
        backoff: 30_000,
        removeOnComplete: true
      }
    )
  })

  it('does not enqueue default workspace skills bootstrap when no personal workspace exists', async () => {
    const bootstrapQueue = {
      add: jest.fn().mockResolvedValue(undefined)
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn().mockResolvedValue({
        workspaceId: null
      }),
      bootstrapUserDefaultWorkspaceSkills: jest.fn(),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleUserOrganizationBootstrap({
      data: {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'owner-1'
      }
    } as any)

    expect(bootstrapQueue.add).not.toHaveBeenCalled()
  })

  it('keeps organization bootstrap focused on workspace initialization', async () => {
    const bootstrapQueue = {
      add: jest.fn()
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn().mockResolvedValue({
        repositoryIds: []
      }),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn(),
      bootstrapUserDefaultWorkspaceSkills: jest.fn(),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleOrganizationBootstrap({
      data: {
        organizationId: 'org-1',
        ownerUserId: 'owner-1',
        tenantId: 'tenant-1'
      }
    } as any)

    expect(bootstrapService.bootstrapOrganization).toHaveBeenCalledWith({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1'
    })
    expect(bootstrapQueue.add).not.toHaveBeenCalled()
  })

  it('delegates repository sync jobs back to the bootstrap service', async () => {
    const bootstrapQueue = {
      add: jest.fn()
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn(),
      bootstrapUserDefaultWorkspaceSkills: jest.fn(),
      syncSkillRepository: jest.fn().mockResolvedValue(undefined)
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleOrganizationSkillRepositorySync({
      data: {
        organizationId: 'org-1',
        ownerUserId: 'owner-1',
        tenantId: 'tenant-1',
        repositoryId: 'repo-1'
      }
    } as any)

    expect(bootstrapService.syncSkillRepository).toHaveBeenCalledWith({
      organizationId: 'org-1',
      ownerUserId: 'owner-1',
      tenantId: 'tenant-1',
      repositoryId: 'repo-1'
    })
  })

  it('delegates default workspace skills jobs back to the bootstrap service', async () => {
    const bootstrapQueue = {
      add: jest.fn()
    }
    const bootstrapService = {
      bootstrapOrganization: jest.fn(),
      bootstrapTenantSkillRepositories: jest.fn(),
      bootstrapUserInOrganization: jest.fn(),
      bootstrapUserDefaultWorkspaceSkills: jest.fn().mockResolvedValue(undefined),
      syncSkillRepository: jest.fn()
    }

    const processor = new ServerAIBootstrapProcessor(bootstrapQueue as any, bootstrapService as any)

    await processor.handleUserDefaultWorkspaceSkillsBootstrap({
      data: {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        workspaceId: 'workspace-1'
      }
    } as any)

    expect(bootstrapService.bootstrapUserDefaultWorkspaceSkills).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      workspaceId: 'workspace-1'
    })
  })
})
