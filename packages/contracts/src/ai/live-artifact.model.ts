/** Cross-product protocol constants for Data X Live Analytics Artifacts. */
export const DATA_X_LIVE_ARTIFACT_VISUALIZATION_TYPE = 'datax.live_artifact' as const
export const DATA_X_LIVE_ARTIFACT_BRIDGE_CHANNEL = 'datax.live_artifact' as const
export const DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION = 1 as const
export const DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA = 'datax.live_artifact/version' as const

export type DataXLiveArtifactActionTypeCode = 'mdx.query_metric_snapshot' | 'mdx.query_cube_slice'

export type DataXLiveArtifactJsonPrimitive = string | number | boolean | null
export type DataXLiveArtifactJsonValue =
  | DataXLiveArtifactJsonPrimitive
  | DataXLiveArtifactJsonValue[]
  | { [key: string]: DataXLiveArtifactJsonValue }

export interface IDataXLiveArtifactTarget {
  entityId?: string
  entityTypeCode?: string
  entityRef?: string
}

export interface IDataXLiveArtifactBinding {
  id: string
  label?: string
  resourceId: string
  actionTypeCode: DataXLiveArtifactActionTypeCode
  target: IDataXLiveArtifactTarget
  params: { [key: string]: DataXLiveArtifactJsonValue }
}

export interface IDataXLiveArtifactSelectOption {
  label: string
  value: string
}

export interface IDataXLiveArtifactControl {
  id: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  defaultValue?: DataXLiveArtifactJsonPrimitive
  options?: IDataXLiveArtifactSelectOption[]
}

export interface IDataXLiveArtifactManifest {
  version: typeof DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION
  bindings: IDataXLiveArtifactBinding[]
  controls?: IDataXLiveArtifactControl[]
  cacheTtlSeconds?: number
}

export interface IDataXLiveArtifactContentRef {
  provider: 'xpert-artifact'
  artifactId: string
  artifactVersionId: string
  versionNumber: number
  mimeType: 'text/html'
  sha256: string
}

export interface IDataXLiveArtifactVersionMetadata {
  schema: typeof DATA_X_LIVE_ARTIFACT_VERSION_METADATA_SCHEMA
  protocolVersion: typeof DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION
  draftId: string
  changeSummary?: string
  manifest: IDataXLiveArtifactManifest
}

export interface IDataXLiveArtifactVisualizationPayload {
  version: typeof DATA_X_LIVE_ARTIFACT_PROTOCOL_VERSION
  draftId: string
  title: string
  description?: string
  contentRef: IDataXLiveArtifactContentRef
  bindingIds: string[]
  cacheTtlSeconds: number
}
