import type { ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '../../project-pipeline/capability'
import { createRuntimeCapability } from '../../core/runtime-capability'

/** Prepare bounded MCP testing for a host-installed release. This API cannot install plugins. */
export interface PluginTestAccessApi {
  prepare(context: ProjectPipelineContext, input: {
    deployment: ProjectPipelineEvidenceRef
    componentKey: string
  }): Promise<{ path: string; publicationId: string; expiresAt: string }>
}

export const PluginTestAccessCapability = createRuntimeCapability<PluginTestAccessApi>('platform.plugin.test-access')
