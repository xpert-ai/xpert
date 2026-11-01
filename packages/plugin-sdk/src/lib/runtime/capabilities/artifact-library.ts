import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ContentDocumentScope } from '../../content-resource'
import type { ArtifactLinkRecord } from './artifacts'
import type { ArtifactTypeDescriptor } from '@xpert-ai/contracts'

export type ArtifactLibraryScope = ContentDocumentScope
export interface ArtifactLibraryItem {
  id: string
  artifactId: string
  versionId: string
  title: string
  type?: ArtifactTypeDescriptor
  revision: number
  url: string
  canManage: boolean
  versions: Array<{ id: string; number: number; title: string }>
  sharing: {
    accessModes: Array<'organization_all' | 'public_link'>
    maxDays: number
    link: ArtifactLinkRecord | null
  } | null
}
/** Spaces is a consumer; adding a reference never grants source access or publishes a share. */
export interface ArtifactLibraryApi {
  add(
    input: ArtifactLibraryScope & { artifactId: string; versionId: string }
  ): Promise<{ referenceId: string; contentId: string }>
  open(input: ArtifactLibraryScope & { referenceId: string }): Promise<ArtifactLibraryItem>
  selectVersion(
    input: ArtifactLibraryScope & { referenceId: string; versionId: string; expectedRevision: number }
  ): Promise<void>
  share(
    input: ArtifactLibraryScope & {
      referenceId: string
      accessMode: 'organization_all' | 'public_link'
      days: number
      acknowledgePublic?: boolean
    }
  ): Promise<ArtifactLinkRecord>
  revoke(input: ArtifactLibraryScope & { referenceId: string }): Promise<void>
}
export const ArtifactLibraryRuntimeCapability = createRuntimeCapability<ArtifactLibraryApi>(
  'platform.artifact-library',
  {
    description: 'Add governed Artifact references to a Project content catalog and manage their published links.'
  }
)
