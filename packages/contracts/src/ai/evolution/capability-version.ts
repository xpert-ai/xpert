import { EvolutionArtifactRef, EvolutionChannel, EvolutionExecutionMode, EvolutionScope } from './target'

export interface CapabilityVersion {
  versionId: string
  targetId: string
  sequence: number
  semanticVersion: string
  artifact: EvolutionArtifactRef
  providerKey: string
  providerVersion: string
  dependencyVersionIds: string[]
  sourceCandidateId?: string
  createdAt: string
  createdBy: string
}

export interface CapabilityVersionBundleItem {
  targetId: string
  versionId: string
  artifactHash: string
  providerKey: string
  providerVersion: string
}

export interface CapabilityVersionBundle {
  bundleId: string
  bundleHash: string
  executionMode: EvolutionExecutionMode
  items: CapabilityVersionBundleItem[]
  createdAt: string
}

export interface ActiveCapabilityPointer {
  pointerId: string
  targetId: string
  scope: EvolutionScope
  channel: EvolutionChannel
  activeVersionId: string
  rollbackVersionId?: string
  releasePackageId?: string
  revision: number
  updatedAt: string
  updatedBy: string
}

export interface ResolveCapabilityBundleRequest {
  scope: EvolutionScope
  executionMode: EvolutionExecutionMode
  targetIds: string[]
}
