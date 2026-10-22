import { isProjectPipelineApplicable, projectPipelineProjectTypesSchema } from './project-types'
import { projectPipelineDefinitionSchema } from './definition.schema'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const review = { applicationKey: '@xpert-ai/plugin-code-review:code-review', projectTypeKey: 'review' }
const bom = { applicationKey: 'sample:bom', projectTypeKey: 'case' }

it('matches both stable keys, supports explicit reuse and excludes unclassified projects', () => {
  const definition = { projectTypes: [review, bom] }
  expect(isProjectPipelineApplicable(definition, review)).toBe(true)
  expect(isProjectPipelineApplicable(definition, bom)).toBe(true)
  expect(isProjectPipelineApplicable(definition, { ...review, applicationKey: bom.applicationKey })).toBe(false)
  expect(isProjectPipelineApplicable(definition, { ...review, projectTypeKey: 'other' })).toBe(false)
  expect(isProjectPipelineApplicable(definition, { applicationKey: 'platform', projectTypeKey: 'general' })).toBe(false)
  expect(isProjectPipelineApplicable(definition, {})).toBe(false)
})

it('rejects missing, empty, duplicate, wildcard and injected applicability declarations', () => {
  for (const value of [
    undefined,
    [],
    [review, review],
    [{ ...review, projectTypeKey: '*' }],
    [{ ...review, tenantId: 'other' }]
  ])
    expect(projectPipelineProjectTypesSchema.safeParse(value).success).toBe(false)
})

it('requires an explicit project type declaration on the actual template schema', () => {
  const proposal = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'),
      'utf8'
    )
  )
  const definition = projectPipelineDefinitionSchema.parse(proposal.template)
  expect(definition.projectTypes).toEqual([review])
  expect(projectPipelineDefinitionSchema.safeParse({ ...definition, projectTypes: undefined }).success).toBe(false)
})
