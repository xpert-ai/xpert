import 'reflect-metadata'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { ProjectPipelineContributionRegistry, projectPipelineContributionSchema } from './registry'
import { ProjectPipelineRuntimeAdapterRegistry } from './runtime-registry'
import { ProjectPipelineProjectionProvider, ProjectPipelineProjectionProviderRegistry } from './projection'

const discovery = () => new DiscoveryService(new ModulesContainer())
const actor = (organizationId: string) => ({ tenantId: 'tenant', organizationId, userId: 'user' })
const source = (scopeKey: string, pluginName = 'neutral') => ({ kind: 'plugin' as const, scopeKey, pluginName })
function metadata() {
  return projectPipelineContributionSchema.parse({
    key: 'neutral',
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
          subjectResolverRef: 'neutral.subject@1',
          topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
          roles: [{ key: 'worker', allowedKinds: ['service'] }],
          lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
          stages: [{ key: 'work', label: 'Work', order: 0 }]
        },
        binding: {
          templateRef: 'neutral.flow@1.0.0',
          parameters: {},
          roleBindings: { worker: { kind: 'service', selectionKey: 'worker' } }
        }
      }
    ]
  })
}

it('does not expose writable registered definitions through catalog reads', () => {
  const registry = new ProjectPipelineContributionRegistry(discovery(), new Reflector())
  const input = metadata()
  registry.register(input.key, input, source('org-a'))
  const exposed = registry.listForActor(actor('org-a'))[0]
  expect(() => {
    exposed.configurations[0].template.title = 'Mutated without a version change'
  }).toThrow()
  expect(() => {
    exposed.configurations.pop()
  }).toThrow()
  input.configurations[0].template.title = 'Plugin-owned copy'
  expect(registry.listForActor(actor('org-a'))[0].configurations[0].template.title).toBe('Original')
  expect(() => registry.register(input.key, input, source('org-a'))).toThrow('VERSION_IMMUTABLE')
})

it('keeps catalog provenance separate when a plugin object is reused across scopes', () => {
  const registry = new ProjectPipelineContributionRegistry(discovery(), new Reflector())
  const input = metadata()
  registry.register(input.key, input, source('org-a', 'alpha'))
  registry.register(input.key, input, source('org-b', 'beta'))
  expect(registry.getSource(registry.listForActor(actor('org-a'))[0])).toEqual(source('org-a', 'alpha'))
  expect(registry.getSource(registry.listForActor(actor('org-b'))[0])).toEqual(source('org-b', 'beta'))
  expect(() => registry.register(input.key, metadata(), source('org-a', 'beta'))).toThrow('OWNER_CONFLICT')
  registry.remove('org-b', 'beta')
  expect(registry.listForActor(actor('org-a'))).toHaveLength(1)
})

it('does not reassign a live adapter object to another provenance', () => {
  const registry = new ProjectPipelineRuntimeAdapterRegistry(discovery(), new Reflector())
  const adapter = {
    kind: 'policy' as const,
    ref: 'neutral.policy@1',
    evaluate: jest.fn(async () => ({ status: 'decided' as const, outcome: 'accept', evidence: [] }))
  }
  registry.register('policy:neutral.policy@1', adapter, source('org-a', 'alpha'))
  expect(() => registry.register('policy:neutral.policy@1', adapter, source('org-b', 'beta'))).toThrow(
    'SOURCE_CONFLICT'
  )
  expect(registry.getSource(registry.getForActor('policy:neutral.policy@1', actor('org-a')))).toEqual(
    source('org-a', 'alpha')
  )
  expect(adapter.evaluate).not.toHaveBeenCalled()
})

it('rejects malformed projection providers before they can enter a catalog or refresh worker', () => {
  const registry = new ProjectPipelineProjectionProviderRegistry(discovery(), new Reflector())
  @ProjectPipelineProjectionProvider('neutral.provider@1')
  class MissingSnapshot {
    key = 'neutral.provider@1'
  }
  @ProjectPipelineProjectionProvider('neutral.provider@1')
  class WrongKey {
    key = 'neutral.other@1'
    snapshot = jest.fn(async () => null)
  }
  @ProjectPipelineProjectionProvider('neutral.provider@1')
  class MissingInspection {
    key = 'neutral.provider@1'
    snapshot = jest.fn(async () => null)
    executeAction = jest.fn(async () => ({ status: 'pending' as const, receiptKey: 'r' }))
  }
  @ProjectPipelineProjectionProvider('neutral.provider@1')
  class FutureProtocol {
    key = 'neutral.provider@1'
    nativeTaskProtocol = 2
    snapshot = jest.fn(async () => null)
  }
  expect(() => registry.upsert(new MissingSnapshot())).toThrow('CONTRACT_INVALID')
  expect(() => registry.upsert(new WrongKey())).toThrow('KEY_MISMATCH')
  expect(() => registry.upsert(new MissingInspection())).toThrow('CONTRACT_INVALID')
  expect(() => registry.upsert(new FutureProtocol())).toThrow('PROTOCOL_UNSUPPORTED')
  expect(registry.listForActor(actor('org-a'))).toEqual([])
})

it('retains read-only providers and does not call their domain methods during registration', () => {
  const registry = new ProjectPipelineProjectionProviderRegistry(discovery(), new Reflector())
  @ProjectPipelineProjectionProvider('neutral.provider@1')
  class ReadOnlyProvider {
    key = 'neutral.provider@1'
    snapshot = jest.fn(async () => null)
  }
  const provider = new ReadOnlyProvider()
  registry.upsert(provider)
  registry.upsert(provider)
  expect(registry.getForActor(provider.key, actor('org-a'))).toBe(provider)
  expect(provider.snapshot).not.toHaveBeenCalled()
})
