import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import { StrategyBus } from '../core/strategy-bus'
import { PLUGIN_METADATA_KEY, ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey } from '../types'
import {
  ProjectPipelineContributionRegistry,
  ProjectPipelineContributor,
  type ProjectPipelineContribution
} from './registry'

@ProjectPipelineContributor('neutral')
class NeutralContribution {
  readonly key = 'neutral'
  readonly configurations = []
  readonly descriptors = [{ kind: 'schema' as const, ref: 'neutral.document@1' }]
}

describe('ProjectPipelineContributionRegistry', () => {
  async function harness() {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [StrategyBus, ProjectPipelineContributionRegistry, NeutralContribution]
    }).compile()
    await module.init()
    return { module, registry: module.get(ProjectPipelineContributionRegistry) }
  }

  it('discovers metadata through Nest and can repeat discovery without duplicate registration', async () => {
    const { module, registry } = await harness()
    registry.upsert(module.get(NeutralContribution))
    expect(registry.listForActor({ tenantId: 'tenant-a', userId: 'user-a' })).toHaveLength(1)
    await module.close()
  })

  it('retains plugin provenance and uses explicit actor scope, including removal', async () => {
    const { module, registry } = await harness()
    @ProjectPipelineContributor('scoped')
    class ScopedContribution {
      key = 'scoped'
      configurations = []
      descriptors = []
    }
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, 'neutral-plugin', ScopedContribution)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-a', ScopedContribution)
    registry.upsert(new ScopedContribution())
    const tenantOnly: ProjectPipelineContribution = { key: 'tenant-only', configurations: [], descriptors: [] }
    registry.register('tenant-only', tenantOnly, {
      kind: 'plugin',
      pluginName: 'tenant-plugin',
      scopeKey: getTenantGlobalScopeKey('tenant-a')
    })
    expect(
      registry.listForActor({ tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user' }).map((item) => item.key)
    ).toEqual(['scoped', 'tenant-only', 'neutral'])
    expect(
      registry.listForActor({ tenantId: 'tenant-b', organizationId: 'org-b', userId: 'user' }).map((item) => item.key)
    ).toEqual(['neutral'])
    registry.remove('org-a', 'neutral-plugin')
    expect(
      registry.listForActor({ tenantId: 'tenant-a', organizationId: 'org-a', userId: 'user' }).map((item) => item.key)
    ).toEqual(['tenant-only', 'neutral'])
    await module.close()
  })

  it('rejects cross-plugin takeover and malformed registrations', async () => {
    const { module, registry } = await harness()
    const metadata: ProjectPipelineContribution = { key: 'scoped', configurations: [], descriptors: [] }
    registry.register('scoped', metadata, { kind: 'plugin', pluginName: 'first', scopeKey: 'org' })
    expect(() =>
      registry.register('scoped', metadata, { kind: 'plugin', pluginName: 'second', scopeKey: 'org' })
    ).toThrow()
    expect(() => registry.register('mismatch', metadata, { kind: 'builtin', scopeKey: 'builtin:global' })).toThrow(
      'KEY_MISMATCH'
    )
    expect(() =>
      registry.register(
        'scoped',
        {
          ...metadata,
          descriptors: [
            { kind: 'schema', ref: 'neutral.document@1' },
            { kind: 'schema', ref: 'neutral.document@1' }
          ]
        },
        { kind: 'plugin', pluginName: 'first', scopeKey: 'org' }
      )
    ).toThrow('DUPLICATE_PIPELINE_CONTRIBUTION')
    await module.close()
  })

  it('requires a new definition version when replacing a registered template', async () => {
    const { module, registry } = await harness()
    const metadata: ProjectPipelineContribution = {
      key: 'immutable',
      descriptors: [],
      configurations: [
        {
          schemaVersion: 1,
          template: {
            key: 'neutral.flow',
            version: '1.0.0',
            title: 'Original',
            executionAuthority: 'provider',
            providerRef: 'neutral.provider@1',
            projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
            subjectResolverRef: 'neutral.subject@1',
            topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
            roles: [{ key: 'owner', allowedKinds: ['human'] }],
            lanes: [{ key: 'owner', roleKey: 'owner', label: 'Owner', order: 0 }],
            stages: [{ key: 'check', label: 'Check', order: 0 }]
          },
          binding: {
            templateRef: 'neutral.flow@1.0.0',
            roleBindings: { owner: { kind: 'human', selectionKey: 'owner' } },
            parameters: {}
          }
        }
      ]
    }
    const source = { kind: 'plugin' as const, pluginName: 'neutral-plugin', scopeKey: 'org' }
    registry.register('immutable', metadata, source)
    const original = metadata.configurations[0]
    const changed = {
      ...metadata,
      configurations: [{ ...original, template: { ...original.template, title: 'Changed' } }]
    }
    expect(() => registry.register('immutable', changed, source)).toThrow('VERSION_IMMUTABLE')
    expect(() =>
      registry.register(
        'immutable',
        {
          ...changed,
          configurations: [
            {
              ...changed.configurations[0],
              template: { ...changed.configurations[0].template, version: '2.0.0' },
              binding: { ...original.binding, templateRef: 'neutral.flow@2.0.0' }
            }
          ]
        },
        source
      )
    ).not.toThrow()
    await module.close()
  })
})
