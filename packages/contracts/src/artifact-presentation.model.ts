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
  expiresAt?: string | null
}

export interface ArtifactPresentationQuery {
  target: ArtifactPresentationTarget
  operation: string
  input: object
}

/** Authenticated Project reference viewing does not create or consume a public share. */
export type ArtifactLibraryContent =
  | { kind: 'conversation'; snapshot: import('./ai/conversation-share.model').ConversationShareSnapshot }
  | { kind: 'presentation'; presentation: ArtifactPresentation }
  | { kind: 'file'; fileName: string; mimeType: string; canDownload: boolean }
export interface ArtifactLibraryView {
  title: string
  revision: number
  content: ArtifactLibraryContent
}
