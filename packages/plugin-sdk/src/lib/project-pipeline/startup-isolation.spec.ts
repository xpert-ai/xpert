import 'reflect-metadata'
import { Controller, Get, Inject, Injectable, Logger, Module } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService, ModulesContainer, NestFactory, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { projectPipelineConfigurationSchema } from '@xpert-ai/contracts'
import { StrategyBus } from '../core/strategy-bus'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from '../types'
import { ProjectPipelineContributionRegistry, ProjectPipelineContributor } from './registry'

function configuration() {
  return {
    schemaVersion: 1,
    template: {
      key: 'review',
      version: '1.0.0',
      title: 'Review',
      executionAuthority: 'provider',
      providerRef: 'review.provider@1',
      subjectResolverRef: 'review.subject@1',
      topology: { source: 'provider', presentationAdapterRef: 'review.presentation@1' },
      roles: [{ key: 'owner', allowedKinds: ['human'] }],
      lanes: [{ key: 'owner', roleKey: 'owner', label: 'Owner', order: 0 }],
      stages: [{ key: 'review', label: 'Review', order: 0 }]
    },
    binding: {
      templateRef: 'review@1.0.0',
      roleBindings: { owner: { kind: 'human', selectionKey: 'owner' } },
      parameters: {}
    }
  }
}
function plugin(target: Function, name = 'legacy-plugin', scope = 'org-a') {
  Reflect.defineMetadata(PLUGIN_METADATA_KEY, name, target)
  Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope, target)
}
const actor = { tenantId: 'tenant', organizationId: 'org-a', userId: 'user' }

@ProjectPipelineContributor('legacy')
class LegacyContribution {
  key = 'legacy'
  configurations = [projectPipelineConfigurationSchema.parse(configuration())]
  descriptors = []
}
plugin(LegacyContribution)

@ProjectPipelineContributor('valid')
class ValidContribution {
  key = 'valid'
  configurations = []
  descriptors = []
}

@Controller('health')
class HealthController {
  @Get() health() {
    return { status: 'ok' }
  }
}

@Module({
  imports: [DiscoveryModule],
  controllers: [HealthController],
  providers: [StrategyBus, ProjectPipelineContributionRegistry, LegacyContribution, ValidContribution]
})
class TestApi {}

describe('plugin pipeline startup isolation', () => {
  let log: jest.SpyInstance
  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    log.mockRestore()
  })

  it('serves HTTP and discovers healthy contributions despite a legacy constructor validation failure', async () => {
    const app = await NestFactory.create(TestApi, { abortOnError: false, logger: false })
    try {
      await app.listen(0, '127.0.0.1')
      expect(await (await fetch(`${await app.getUrl()}/health`)).json()).toEqual({ status: 'ok' })
      const registry = app.get(ProjectPipelineContributionRegistry)
      expect(registry.listForActor(actor).map((item) => item.key)).toEqual(['valid'])
      expect(registry.getRegistrationFailures()).toEqual([
        expect.objectContaining({
          key: 'legacy',
          code: 'PIPELINE_CONTRIBUTION_INVALID',
          source: { kind: 'plugin', pluginName: 'legacy-plugin', scopeKey: 'org-a' },
          issues: [{ path: ['template', 'projectTypes'], code: 'invalid_type' }]
        })
      ])
    } finally {
      await app.close()
    }
  })

  it('isolates discovery-time validation and clears diagnostics after a corrected contribution is loaded', () => {
    const registry = new ProjectPipelineContributionRegistry(
      new DiscoveryService(new ModulesContainer()),
      new Reflector()
    )
    @ProjectPipelineContributor('raw')
    class RawContribution {
      key = 'raw'
      configurations: unknown[] = [configuration()]
      descriptors = []
    }
    plugin(RawContribution)
    const value = new RawContribution()
    expect(() => registry.upsert(value)).not.toThrow()
    expect(registry.listForActor(actor)).toEqual([])
    expect(registry.getRegistrationFailures()[0].issues[0].path).toEqual([
      'configurations',
      0,
      'template',
      'projectTypes'
    ])
    value.configurations = []
    registry.upsert(value)
    expect(registry.getRegistrationFailures()).toEqual([])
    expect(registry.listForActor(actor).map((item) => item.key)).toEqual(['raw'])
    value.configurations = [configuration()]
    registry.upsert(value)
    expect(registry.listForActor(actor)).toEqual([])
    registry.remove('org-a', 'legacy-plugin')
    expect(registry.getRegistrationFailures()).toEqual([])
  })

  it('preserves constructor/property injection, prototype identity and lifecycle hooks for healthy providers', async () => {
    @Injectable()
    class Dependency {
      value = 'injected'
    }
    @Injectable()
    @ProjectPipelineContributor('injected')
    class InjectedContribution {
      key = 'injected'
      configurations = []
      descriptors = []
      initialized = false
      @Inject(Dependency) property: Dependency
      constructor(@Inject(Dependency) readonly dependency: Dependency) {}
      onModuleInit() {
        this.initialized = true
      }
    }
    plugin(InjectedContribution)
    const module = await Test.createTestingModule({ providers: [Dependency, InjectedContribution] }).compile()
    try {
      await module.init()
      const instance = module.get(InjectedContribution)
      expect(instance).toBeInstanceOf(InjectedContribution)
      expect(instance.dependency.value).toBe('injected')
      expect(instance.property).toBe(instance.dependency)
      expect(instance.initialized).toBe(true)
    } finally {
      await module.close()
    }
  })

  it('does not suppress built-in schema defects or unexpected plugin constructor errors', () => {
    @ProjectPipelineContributor('builtin-broken')
    class BuiltinBroken {
      configurations = [projectPipelineConfigurationSchema.parse(configuration())]
    }
    expect(() => new BuiltinBroken()).toThrow()
    @ProjectPipelineContributor('unexpected')
    class Unexpected {
      constructor() {
        throw new Error('unexpected defect')
      }
    }
    plugin(Unexpected)
    expect(() => new Unexpected()).toThrow('unexpected defect')
    const registry = new ProjectPipelineContributionRegistry(
      new DiscoveryService(new ModulesContainer()),
      new Reflector()
    )
    expect(() =>
      registry.register(
        'raw',
        { key: 'raw', configurations: [], descriptors: [{ kind: 'schema', ref: 'bad' }] },
        { kind: 'plugin', pluginName: 'legacy-plugin', scopeKey: 'org-a' }
      )
    ).toThrow()
  })

  it('keeps failed registration scoped and never logs plugin payloads', () => {
    const registry = new ProjectPipelineContributionRegistry(
      new DiscoveryService(new ModulesContainer()),
      new Reflector()
    )
    @ProjectPipelineContributor('shared')
    class Contribution {
      key = 'shared'
      configurations: unknown[] = []
      descriptors = []
    }
    plugin(Contribution, 'healthy', 'org-b')
    registry.upsert(new Contribution())
    plugin(Contribution, 'legacy-plugin', 'org-a')
    const invalid = new Contribution()
    invalid.configurations = [{ ...configuration(), confidential: 'secret-value' }]
    registry.upsert(invalid)
    expect(registry.listForActor({ ...actor, organizationId: 'org-b' })).toHaveLength(1)
    expect(registry.listForActor(actor)).toEqual([])
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-value')
    expect(JSON.stringify(registry.getRegistrationFailures())).not.toContain('secret-value')
  })
})
