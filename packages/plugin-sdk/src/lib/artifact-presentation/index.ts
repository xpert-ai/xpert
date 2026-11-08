import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { ArtifactPresentationQuery } from '@xpert-ai/contracts'
import type { ArtifactVersionContext } from '../artifact-type/version-context'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'

export const ARTIFACT_PRESENTATION_PROVIDER = 'ARTIFACT_PRESENTATION_PROVIDER'
/** Exact plugin/type registration key; use declared identifiers, never titles, MIME types or storage kinds. */
export interface ArtifactPresentationSource {
  /** Owning plugin's registered package name. */
  pluginName: string
  /** Artifact type key declared within that plugin's namespace. */
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

/** Authorized version plus optional host-derived usage metadata for read-only presentation. */
export interface ArtifactPresentationContext extends ArtifactVersionContext {
  /** Optional host-derived cross-project usage; absent for ordinary source presentation. Never accept it from tool input. */
  usage?: {
    /** Explicit usage discriminator; future kinds need their own host authorization and provider support. */
    kind: 'group-reference'
    /** Accepted placement being accessed, distinct from the backing grant and source Artifact. */
    referenceId: string
    /** Live grant whose scope and lifecycle the host rechecks. */
    grantId: string
    /** Receiving group audience; sharing its runtime Project does not share its grant. */
    groupId: string
    /** Usage Project bound to the group; do not use it to locate source version bytes. */
    runtimeProjectId: string
    /** Source Project, consistent with artifact.projectId; does not confer source membership or Assistant binding. */
    ownerProjectId: string
  }
}

/**
 * Plugin implementation for read-only presentation of its registered Artifact type.
 * Return only client-safe payloads and preserve the current viewer's upstream data ACLs.
 * Declared operations express viewer support; they do not replace platform authorization.
 */
export interface IArtifactPresentationProvider {
  /** Read-only interactive operation names. Group use intersects these with ArtifactTypeDefinition.useGrants.queryOperations. */
  readonly operations: readonly string[]
  /** Viewer entry HTML without actor credentials; resource data and queries arrive through the host presentation bridge. */
  getEntry(): Promise<{ html: string }>
  /** Client-safe state derived from context.content; omit credentials, private file handles and native query declarations. */
  read(context: ArtifactPresentationContext): Promise<object>
  /** Validate the operation-specific input and pinned target, then execute a read under context.actor's data permissions. */
  query(context: ArtifactPresentationContext, request: ArtifactPresentationQuery): Promise<object>
}

@Injectable()
export class ArtifactPresentationRegistry extends BaseStrategyRegistry<IArtifactPresentationProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(ARTIFACT_PRESENTATION_PROVIDER, discovery, reflector)
  }
}
