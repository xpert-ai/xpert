import type { ProjectPipelineBinding } from './configuration.schema'
import type { ProjectPipelineDefinition } from './definition.schema'
import type { ProjectPipelineCompatibilityIssue, ProjectPipelineHostCapabilities } from './compatibility.schema'

/** Derive requirements from typed execution semantics even when a legacy template omits its declaration. */
export function checkProjectPipelineHostCompatibility(
  definition: ProjectPipelineDefinition,
  binding: ProjectPipelineBinding | null | undefined,
  host: ProjectPipelineHostCapabilities
): ProjectPipelineCompatibilityIssue[] {
  const issues: ProjectPipelineCompatibilityIssue[] = []
  const protocol = definition.hostRequirements?.protocol ?? 1
  if (!host.protocols.includes(protocol))
    issues.push({ code: 'HOST_PROTOCOL_UNSUPPORTED', path: ['template', 'hostRequirements', 'protocol'] })
  const requireFeature = (
    ref: string,
    version = 1,
    path: Array<string | number> = ['template', 'hostRequirements', 'features', ref]
  ) => {
    const versions = Object.prototype.hasOwnProperty.call(host.features, ref) ? host.features[ref] : undefined
    if (!versions?.includes(version) && !issues.some((issue) => issue.ref === ref))
      issues.push({ code: 'HOST_FEATURE_UNSUPPORTED', path, ref })
  }
  requireFeature('pipeline.core')
  if (definition.executionAuthority === 'provider') {
    requireFeature('pipeline.provider_projection')
    if (definition.actionRefs?.length) requireFeature('pipeline.provider_actions')
  } else {
    requireFeature('pipeline.managed')
    if (binding?.limits?.nativeModelBudget)
      requireFeature('pipeline.native_model_budget', 1, ['binding', 'limits', 'nativeModelBudget'])
    definition.nodes.forEach((node, index) => {
      if (node.kind === 'work' && node.resourceResolverRef)
        requireFeature('pipeline.resources', 1, ['template', 'nodes', index, 'resourceResolverRef'])
    })
    for (const [slot, executor] of Object.entries(binding?.executorBindings ?? {})) {
      if (executor.kind === 'assistant') requireFeature('pipeline.assistant', 1, ['binding', 'executorBindings', slot])
      if (executor.kind === 'runtime_binding') {
        requireFeature('pipeline.runtime_binding', 1, ['binding', 'executorBindings', slot])
        if (executor.workspaceId)
          requireFeature('pipeline.runtime_workspace', 1, ['binding', 'executorBindings', slot, 'workspaceId'])
      }
    }
  }
  for (const [feature, version] of Object.entries(definition.hostRequirements?.features ?? {}))
    requireFeature(feature, version)
  return issues
}
