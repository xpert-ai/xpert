import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod/v3'
import { projectPipelineConfigurationSchema } from './configuration.schema'
import { checkProjectPipelineHostCompatibility } from './compatibility'
import { projectPipelineHostCapabilitiesSchema, projectPipelineHostRequirementsSchema } from './compatibility.schema'

const example = z
  .object({ template: z.unknown(), binding: z.unknown() })
  .parse(
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'),
        'utf8'
      )
    )
  )
const configuration = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, ...example })
const host = {
  protocols: [1],
  features: {
    'pipeline.core': [1],
    'pipeline.managed': [1],
    'pipeline.assistant': [1],
    'pipeline.runtime_binding': [1],
    'pipeline.runtime_workspace': [1],
    'pipeline.resources': [1]
  }
}

it('keeps old definitions byte-for-byte and checks their real executor semantics', () => {
  const before = JSON.stringify(configuration)
  expect(checkProjectPipelineHostCompatibility(configuration.template, configuration.binding, host)).toEqual([])
  expect(JSON.stringify(configuration)).toBe(before)
  const issues = checkProjectPipelineHostCompatibility(configuration.template, configuration.binding, {
    ...host,
    features: { 'pipeline.core': [1], 'pipeline.managed': [1], 'pipeline.assistant': [1] }
  })
  expect(issues).toEqual([
    expect.objectContaining({ code: 'HOST_FEATURE_UNSUPPORTED', ref: 'pipeline.runtime_binding' })
  ])
})
it('requires exact explicit versions and treats unknown features as unsupported', () => {
  const template = {
    ...configuration.template,
    hostRequirements: { protocol: 2, features: { 'pipeline.core': 2, 'pipeline.future': 1 } }
  }
  expect(checkProjectPipelineHostCompatibility(template, configuration.binding, host).map((item) => item.code)).toEqual(
    ['HOST_PROTOCOL_UNSUPPORTED', 'HOST_FEATURE_UNSUPPORTED', 'HOST_FEATURE_UNSUPPORTED']
  )
  expect(
    checkProjectPipelineHostCompatibility(template, configuration.binding, {
      protocols: [1, 2],
      features: { ...host.features, 'pipeline.core': [1, 2], 'pipeline.future': [1] }
    })
  ).toEqual([])
  // Advertising a higher version does not claim backwards compatibility with version 1.
  expect(
    checkProjectPipelineHostCompatibility(configuration.template, configuration.binding, {
      ...host,
      features: { ...host.features, 'pipeline.core': [2] }
    })
  ).toContainEqual(expect.objectContaining({ ref: 'pipeline.core' }))
})
it('does not allow explicit declarations to hide inferred required features', () => {
  const template = { ...configuration.template, hostRequirements: { protocol: 1, features: {} } }
  expect(
    checkProjectPipelineHostCompatibility(template, configuration.binding, { protocols: [1], features: {} }).length
  ).toBeGreaterThan(0)
})
it('requires workspace support only for an explicitly selected Runtime workspace', () => {
  const binding = projectPipelineConfigurationSchema.parse({
    ...configuration,
    binding: {
      ...configuration.binding,
      executorBindings: {
        ...configuration.binding.executorBindings,
        verifier: {
          ...configuration.binding.executorBindings!['verifier'],
          workspaceId: '00000000-0000-4000-8000-000000000001'
        }
      }
    }
  }).binding
  const { 'pipeline.runtime_workspace': ignored, ...features } = host.features
  expect(
    checkProjectPipelineHostCompatibility(configuration.template, configuration.binding, { ...host, features })
  ).toEqual([])
  expect(checkProjectPipelineHostCompatibility(configuration.template, binding, { ...host, features })).toContainEqual(
    expect.objectContaining({ ref: 'pipeline.runtime_workspace' })
  )
})
it.each([
  { protocol: '1', features: {} },
  { protocol: 0, features: {} },
  { protocol: 1, features: { future: 1.5 } },
  { protocol: 1, features: {}, token: 'not-accepted' },
  { protocol: 1, features: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`feature${i}`, 1])) }
])('rejects malformed requirements without relaxing the metadata boundary', (input) => {
  expect(projectPipelineHostRequirementsSchema.safeParse(input).success).toBe(false)
})
it('rejects duplicate support versions and injected profile overrides', () => {
  expect(projectPipelineHostCapabilitiesSchema.safeParse({ protocols: [1, 1], features: {} }).success).toBe(false)
  expect(projectPipelineHostCapabilitiesSchema.safeParse({ ...host, tenantId: 'override' }).success).toBe(false)
})
it('does not treat inherited object properties as advertised feature protocols', () => {
  const template = {
    ...configuration.template,
    hostRequirements: { protocol: 1, features: { constructor: 1, toString: 1 } }
  }
  expect(checkProjectPipelineHostCompatibility(template, configuration.binding, host).map((item) => item.ref)).toEqual([
    'constructor',
    'toString'
  ])
})
