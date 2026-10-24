import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { LanguagesEnum, RequestScopeLevel } from '@xpert-ai/contracts'
import {
  IntegrationStrategyRegistry,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  RequestContext,
  StrategyBus,
  SYSTEM_GLOBAL_SCOPE
} from '@xpert-ai/plugin-sdk'
import { UserService } from '../../../server/src/user'
import { Integration } from '../../../server/src/integration/integration.entity'
import { IntegrationService } from '../../../server/src/integration/integration.service'
import { IntegrationUpsertCommand } from '../../../server/src/integration/commands/upsert.command'
import { IntegrationUpsertHandler } from '../../../server/src/integration/commands/handlers/upsert.handler'
import plugin, { GitHubIntegrationPlugin, GitHubIntegrationStrategy } from './index'

jest.mock('../../../server/src/core/crud', () => ({
  TenantOrganizationAwareCrudService: class {
    findOne = jest.fn()
    create = jest.fn()
    update = jest.fn()
  }
}))
jest.mock('../../../server/src/user', () => ({ UserService: class UserService {} }))
jest.mock('../../../server/src/integration/integration.entity', () => ({ Integration: class Integration {} }))

describe('built-in GitHub System Integration', () => {
  let module: TestingModule
  let service: IntegrationService
  let strategy: GitHubIntegrationStrategy
  let upsert: IntegrationUpsertHandler
  const legacy = {
    id: 'existing-integration',
    name: 'Existing GitHub',
    slug: 'existing-app',
    provider: 'github',
    tenantId: 'default-tenant',
    organizationId: null,
    options: { appName: 'Display.Name', clientId: 'client', clientSecret: 'secret-fixture' }
  }

  beforeEach(async () => {
    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
      tenantId: 'default-tenant',
      level: RequestScopeLevel.TENANT,
      organizationId: null
    })
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
    jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(LanguagesEnum.English)
    // The plugin loader stamps these before Nest discovers strategy providers.
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, SYSTEM_GLOBAL_SCOPE, GitHubIntegrationStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, plugin.meta.name, GitHubIntegrationStrategy)
    module = await Test.createTestingModule({
      imports: [DiscoveryModule, GitHubIntegrationPlugin],
      providers: [
        StrategyBus,
        IntegrationStrategyRegistry,
        IntegrationService,
        IntegrationUpsertHandler,
        { provide: getRepositoryToken(Integration), useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: CommandBus, useValue: {} }
      ]
    }).compile()
    await module.init()
    strategy = module.get(GitHubIntegrationStrategy)
    service = module.get(IntegrationService)
    upsert = module.get(IntegrationUpsertHandler)
    jest.spyOn(service, 'findOne').mockResolvedValue(Object.assign(new Integration(), legacy))
  })

  afterEach(async () => {
    await module?.close()
    Reflect.deleteMetadata(ORGANIZATION_METADATA_KEY, GitHubIntegrationStrategy)
    Reflect.deleteMetadata(PLUGIN_METADATA_KEY, GitHubIntegrationStrategy)
    jest.restoreAllMocks()
  })

  it('discovers the provider through Nest and retains the github key across tenant scopes', () => {
    const registry = module.get(IntegrationStrategyRegistry)
    expect(registry.get('github')).toBe(strategy)
    expect(registry.getSource(strategy)).toEqual({
      kind: 'plugin',
      pluginName: plugin.meta.name,
      scopeKey: SYSTEM_GLOBAL_SCOPE
    })
    expect(service.getProviders().map(({ name }) => name)).toEqual(['github'])
    jest.mocked(RequestContext.getScope).mockReturnValue({
      tenantId: 'another-tenant',
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'another-org'
    })
    jest.mocked(RequestContext.getOrganizationId).mockReturnValue('another-org')
    expect(service.getIntegrationStrategy('github')).toBe(strategy)
  })

  it('keeps credentials in Integration options and marks secret fields for the generic editor', () => {
    expect(plugin.config.schema.parse({})).toEqual({})
    expect(plugin.config.schema.safeParse({ clientSecret: 'fixture' }).success).toBe(false)
    expect(strategy.meta.schema.secret).toEqual(['clientSecret', 'privateKey', 'webhookSecret'])
    for (const field of strategy.meta.schema.secret) {
      expect(strategy.meta.schema.properties[field]).toMatchObject({
        'x-ui': { component: 'secretInput', revealable: false }
      })
    }
  })

  it('saves legacy OAuth-only configuration without changing identity or requiring App fields', async () => {
    await upsert.execute(new IntegrationUpsertCommand({ id: legacy.id, name: 'Renamed' }))
    const { id, ...unchanged } = legacy
    expect(service.update).toHaveBeenCalledWith(id, { ...unchanged, name: 'Renamed' })
  })

  it('upgrades the same record with App settings while preserving OAuth credentials', async () => {
    await upsert.execute(
      new IntegrationUpsertCommand({
        id: legacy.id,
        options: { appId: '42', appSlug: 'review-app', privateKey: 'pem-fixture', clientSecret: '' }
      })
    )
    expect(service.update).toHaveBeenCalledWith(
      legacy.id,
      expect.objectContaining({
        provider: 'github',
        tenantId: legacy.tenantId,
        organizationId: null,
        slug: legacy.slug,
        options: { ...legacy.options, appId: '42', appSlug: 'review-app', privateKey: 'pem-fixture' }
      })
    )
    expect(service.create).not.toHaveBeenCalled()
  })

  it('rejects invalid App settings before writing the record', async () => {
    await expect(
      upsert.execute(
        new IntegrationUpsertCommand({
          id: legacy.id,
          options: { webhookSecret: 'short-fixture' }
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(service.update).not.toHaveBeenCalled()
  })

  it('reports local validation without returning credentials or claiming GitHub connectivity', async () => {
    const result = await service.test(legacy)
    expect(result).toEqual({
      probe: { state: 'configuration_valid' },
      warnings: [expect.stringContaining('validated locally')]
    })
    expect(JSON.stringify(result)).not.toContain('secret-fixture')
    expect(result && result.probe?.connected).toBeUndefined()
  })

  it('localizes configuration guidance without changing the machine-readable probe', async () => {
    jest.mocked(RequestContext.getLanguageCode).mockReturnValue(LanguagesEnum.Chinese)
    const result = await strategy.validateConfig(legacy.options)
    expect(result.probe.state).toBe('configuration_valid')
    expect(result.warnings[0]).toContain('本地配置校验')
    expect(() => strategy.prepareConfig({ appId: 'invalid-fixture' })).toThrow('GitHub 集成配置无效')
  })
})
