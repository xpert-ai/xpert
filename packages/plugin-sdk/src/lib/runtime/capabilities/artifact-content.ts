import { createRuntimeCapability } from '../../core/runtime-capability'
import type { WorkspacePortableFileReference, WorkspaceFileBuffer } from './workspace-files'

/** Content owned by an Artifact, isolated from generic Project/Assistant file access. */
export interface ArtifactContentApi {
  write(input: { artifactId: string; buffer: Buffer }): Promise<WorkspacePortableFileReference>
  /** Reauthorizes a published version or the working draft owning these exact bytes. */
  read(reference: WorkspacePortableFileReference): Promise<WorkspaceFileBuffer>
}
export const ArtifactContentRuntimeCapability = createRuntimeCapability<ArtifactContentApi>(
  'platform.artifact-content',
  {
    description:
      'Store Artifact content outside ordinary workspace files and authorize reads against its published version or draft.'
  }
)
