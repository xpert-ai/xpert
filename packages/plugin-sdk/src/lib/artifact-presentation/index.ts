import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { ArtifactPresentationQuery } from '@xpert-ai/contracts'
import type { ArtifactRecord, ArtifactVersionRecord } from '../runtime/capabilities/artifacts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'

export const ARTIFACT_PRESENTATION_PROVIDER = 'ARTIFACT_PRESENTATION_PROVIDER'
export interface ArtifactPresentationSource {
  pluginName: string
  resourceType: string
}
export const artifactPresentationKey = (source: ArtifactPresentationSource) =>
  `${source.pluginName}:${source.resourceType}`

/** Registers a read-only renderer for an explicit Artifact source, independently of Workbench actions. */
export const ArtifactPresentationProvider = (source: ArtifactPresentationSource) =>
  applyDecorators(
    SetMetadata(ARTIFACT_PRESENTATION_PROVIDER, artifactPresentationKey(source)),
    SetMetadata(STRATEGY_META_KEY, ARTIFACT_PRESENTATION_PROVIDER)
  )

export interface ArtifactPresentationContext {
  /** Current authenticated viewer. Never substitute the Artifact creator. */
  actor: { tenantId: string; organizationId: string; userId: string }
  artifact: ArtifactRecord
  version: ArtifactVersionRecord
  /** Platform-authorized, integrity-checked version bytes. This grants no Workspace file access. */
  content: Buffer
}

export interface IArtifactPresentationProvider {
  readonly operations: readonly string[]
  getEntry(): Promise<{ html: string }>
  read(context: ArtifactPresentationContext): Promise<object>
  query(context: ArtifactPresentationContext, request: ArtifactPresentationQuery): Promise<object>
}

@Injectable()
export class ArtifactPresentationRegistry extends BaseStrategyRegistry<IArtifactPresentationProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(ARTIFACT_PRESENTATION_PROVIDER, discovery, reflector)
  }
}
