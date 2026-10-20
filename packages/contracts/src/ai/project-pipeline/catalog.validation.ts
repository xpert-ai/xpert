import type { ProjectPipelineConfiguration } from './configuration.schema'
import type {
  ProjectPipelineConfigurationCheck,
  ProjectPipelineExtensionDescriptor,
  ProjectPipelineExtensionKind
} from './catalog.schema'

/** Checks declared dependencies only. Participant authorization and live capabilities require runtime resolution. */
export function checkProjectPipelineConfiguration(
  configuration: ProjectPipelineConfiguration,
  descriptors: readonly ProjectPipelineExtensionDescriptor[]
): ProjectPipelineConfigurationCheck {
  const { template, binding } = configuration
  const issues: ProjectPipelineConfigurationCheck['issues'] = []
  const requiredCapabilities: ProjectPipelineConfigurationCheck['requiredCapabilities'] = []
  const catalog = new Map<string, ProjectPipelineExtensionDescriptor>()
  for (const descriptor of descriptors) {
    const key = `${descriptor.kind}:${descriptor.ref}`
    if (catalog.has(key)) issues.push({ code: 'AMBIGUOUS_EXTENSION', path: [], ref: descriptor.ref })
    catalog.set(key, descriptor)
  }
  const requireRef = (kind: ProjectPipelineExtensionKind, ref: string, path: Array<string | number>) => {
    const descriptor = catalog.get(`${kind}:${ref}`)
    if (!descriptor) issues.push({ code: 'EXTENSION_NOT_REGISTERED', path, ref })
    return descriptor
  }
  const subject = requireRef('subject', template.subjectResolverRef, ['template', 'subjectResolverRef'])
  if (subject?.kind === 'subject') requireRef('schema', subject.outputSchemaRef, ['template', 'subjectResolverRef'])
  if (template.presentation?.nodeDetailRef)
    requireRef('presentation', template.presentation.nodeDetailRef, ['template', 'presentation', 'nodeDetailRef'])
  template.presentation?.evidenceTypes?.forEach((ref, i) =>
    requireRef('schema', ref, ['template', 'presentation', 'evidenceTypes', i])
  )
  template.metrics?.dimensionRefs.forEach((ref, i) =>
    requireRef('dimension', ref, ['template', 'metrics', 'dimensionRefs', i])
  )
  template.metrics?.metricRefs.forEach((ref, i) => requireRef('metric', ref, ['template', 'metrics', 'metricRefs', i]))
  if (template.executionAuthority === 'provider') {
    requireRef('projection', template.providerRef, ['template', 'providerRef'])
    requireRef('presentation', template.topology.presentationAdapterRef, [
      'template',
      'topology',
      'presentationAdapterRef'
    ])
    template.actionRefs?.forEach((ref, i) => requireRef('action', ref, ['template', 'actionRefs', i]))
  } else {
    binding.triggers?.forEach((trigger, i) => requireRef('trigger', trigger.adapterRef, ['binding', 'triggers', i]))
    const nodes = new Map(template.nodes.map((node) => [node.key, node]))
    for (const [index, node] of template.nodes.entries()) {
      const path = ['template', 'nodes', index]
      for (const [port, schemaRef] of Object.entries(node.outputPorts ?? {}))
        requireRef('schema', schemaRef, [...path, 'outputPorts', port])
      if (node.kind === 'router' || node.kind === 'human_gate') {
        const policy = requireRef('policy', node.policyRef, [...path, 'policyRef'])
        if (
          policy?.kind === 'policy' &&
          (policy.outcomes.length !== node.outcomes.length ||
            policy.outcomes.some((outcome) => !node.outcomes.includes(outcome)))
        ) {
          issues.push({ code: 'POLICY_OUTCOMES_MISMATCH', path: [...path, 'outcomes'], ref: node.policyRef })
        }
      }
      if (node.kind === 'external_wait') {
        const subscription = requireRef('subscription', node.subscriptionRef, [...path, 'subscriptionRef'])
        if (subscription?.kind === 'subscription') checkOutputs(subscription.outputs, node.outputPorts ?? {}, path)
      }
      if (node.kind !== 'work') continue
      if (node.resourceResolverRef) requireRef('resource', node.resourceResolverRef, [...path, 'resourceResolverRef'])
      requireRef('completion', node.completionRef, [...path, 'completionRef'])
      if (node.outputSchemaRef) requireRef('schema', node.outputSchemaRef, [...path, 'outputSchemaRef'])
      const operation = requireRef('operation', node.operationRef, [...path, 'operationRef'])
      if (operation?.kind !== 'operation') continue
      if (operation.effects !== 'read_only' && operation.idempotency !== 'keyed_receipt') {
        issues.push({ code: 'WRITE_REQUIRES_IDEMPOTENCY', path: [...path, 'operationRef'], ref: operation.ref })
      }
      const capabilities = new Set([
        ...operation.requiredCapabilities,
        ...(binding.executorBindings?.[node.executorSlot]?.requiredCapabilities ?? [])
      ])
      const previous = requiredCapabilities.find((item) => item.executorSlot === node.executorSlot)
      if (previous) previous.capabilities = [...new Set([...previous.capabilities, ...capabilities])].sort()
      else requiredCapabilities.push({ executorSlot: node.executorSlot, capabilities: [...capabilities].sort() })
      checkOutputs(operation.outputs, node.outputPorts ?? {}, path)
      for (const [port, expected] of Object.entries(operation.inputs)) {
        requireRef('schema', expected.schemaRef, [...path, 'inputBindings', port])
        const input =
          node.inputBindings && Object.prototype.hasOwnProperty.call(node.inputBindings, port)
            ? node.inputBindings[port]
            : undefined
        if (!input) {
          issues.push({ code: 'OPERATION_INPUT_MISSING', path: [...path, 'inputBindings', port] })
          continue
        }
        if ((input.from === 'collection') !== (expected.cardinality === 'collection')) {
          issues.push({ code: 'INPUT_CARDINALITY_MISMATCH', path: [...path, 'inputBindings', port] })
        }
        const sourceSchemas =
          input.from === 'collection'
            ? input.items.map((item) => nodes.get(item.nodeKey)?.outputPorts?.[item.port])
            : input.from === 'node_output'
              ? [nodes.get(input.nodeKey)?.outputPorts?.[input.port]]
              : input.from === 'subject' && subject?.kind === 'subject'
                ? [subject.outputSchemaRef]
                : []
        if (sourceSchemas.some((ref) => ref !== expected.schemaRef)) {
          issues.push({ code: 'INPUT_SCHEMA_MISMATCH', path: [...path, 'inputBindings', port] })
        }
      }
      for (const port of Object.keys(node.inputBindings ?? {})) {
        if (!Object.prototype.hasOwnProperty.call(operation.inputs, port))
          issues.push({ code: 'OPERATION_INPUT_UNKNOWN', path: [...path, 'inputBindings', port] })
      }
    }
  }
  return { valid: issues.length === 0, runtimeReadiness: 'not_checked', issues, requiredCapabilities }

  function checkOutputs(
    expected: { [port: string]: string },
    actual: { [port: string]: string },
    path: Array<string | number>
  ) {
    for (const port of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!actual[port] || actual[port] !== expected[port])
        issues.push({ code: 'OUTPUT_SCHEMA_MISMATCH', path: [...path, 'outputPorts', port] })
    }
  }
}
