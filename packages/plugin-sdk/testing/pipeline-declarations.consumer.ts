import type {
  ProjectPipelineConfiguration,
  ProjectPipelineBinding,
  ProjectPipelineGraph,
  ProjectTaskAssistantExecutionTarget
} from '@xpert-ai/contracts'
import type { ProjectPipelineContribution } from '@xpert-ai/plugin-sdk'

// Check published declarations, not source aliases: loose-null Zod emission can silently
// weaken a plugin's required fields even when all runtime validation tests pass.
type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type ConfigurationIsTyped = Assert<IsAny<ProjectPipelineConfiguration> extends false ? true : false>
type ContributionIsTyped = Assert<IsAny<ProjectPipelineContribution> extends false ? true : false>

declare const configuration: ProjectPipelineConfiguration
declare const contribution: ProjectPipelineContribution
declare const graph: ProjectPipelineGraph
const version: 1 = configuration.schemaVersion
const ref: string = configuration.binding.templateRef
const key: string = contribution.key
const configurations: ProjectPipelineConfiguration[] = contribution.configurations
const title: string = graph.instance.title

// @ts-expect-error Required configuration fields must survive declaration emission.
const missingConfiguration: ProjectPipelineConfiguration = {}
// @ts-expect-error Required binding fields must survive declaration emission.
const missingBindings: ProjectPipelineBinding = { templateRef: 'neutral@1' }
// @ts-expect-error The existing SDK export must retain required catalog fields.
const missingContribution: ProjectPipelineContribution = {}

interface SpecializedAssistantTarget extends ProjectTaskAssistantExecutionTarget {
  localLabel: string
}
