/** Host-owned opening avoids inheriting a remote component's iframe sandbox. */
export const ARTIFACT_PRESENTATION_OPEN_COMMAND = 'artifact.presentation.open'
export interface ArtifactPresentationOpenRequest {
  url: string
}

/** A viewer always operates on one published, immutable version. Drafts are not share targets. */
export interface ArtifactPresentationTarget {
  artifactId: string
  versionId: string
}

/** Platform-owned envelope; data is parsed by the registered presentation provider. */
export interface ArtifactPresentation {
  schemaVersion: 1
  target: ArtifactPresentationTarget
  title: string
  versionNumber: number
  readOnly: true
  entry: { html: string }
  data: object
  operations: string[]
}

export interface ArtifactPresentationQuery {
  target: ArtifactPresentationTarget
  operation: string
  input: object
}
