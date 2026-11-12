import { EvolutionArtifactRef, EvolutionChannel, EvolutionExecutionMode, EvolutionScope } from './target'

/** Immutable version of a target and its dependencies. Creating a version does not make it active. */
export interface CapabilityVersion {
  versionId: string
  targetId: string
  /** Version sequence for the target; unrelated to a channel pointer's revision. */
  sequence: number
  semanticVersion: string
  artifact: EvolutionArtifactRef
  providerKey: string
  providerVersion: string
  /** Concrete versions on which this version depends. */
  dependencyVersionIds: string[]
  /** Candidate from which this version was promoted, if it originated from one. */
  sourceCandidateId?: string
  createdAt: string
  createdBy: string
}

/** Pins one target's version and artifact identity for an execution or replay. */
export interface CapabilityVersionBundleItem {
  targetId: string
  versionId: string
  /** Expected hash of the artifact for this binding. A different payload does not satisfy the assignment. */
  artifactHash: string
  providerKey: string
  providerVersion: string
}

/** Immutable set of version bindings. It identifies the artifacts used, without embedding their contents. */
export interface CapabilityVersionBundle {
  bundleId: string
  /** Digest of the version bindings, distinct from the hash of any individual artifact. */
  bundleHash: string
  executionMode: EvolutionExecutionMode
  items: CapabilityVersionBundleItem[]
  createdAt: string
}

/** Mutable selection of an immutable version for one target, scope and release channel. */
export interface ActiveCapabilityPointer {
  pointerId: string
  targetId: string
  scope: EvolutionScope
  channel: EvolutionChannel
  activeVersionId: string
  /** Previously selected version retained as the rollback destination, when available. */
  rollbackVersionId?: string
  releasePackageId?: string
  /** Revision of the selection for concurrency checks; distinct from the version sequence. */
  revision: number
  updatedAt: string
  updatedBy: string
}

/** Selects the targets, scope and execution mode for a version bundle. */
export interface ResolveCapabilityBundleRequest {
  scope: EvolutionScope
  executionMode: EvolutionExecutionMode
  targetIds: string[]
}
