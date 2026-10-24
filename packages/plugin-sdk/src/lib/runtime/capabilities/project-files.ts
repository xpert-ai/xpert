import { createRuntimeCapability } from '../../core/runtime-capability'
import type { ProjectAccessActor } from './project-access'

export type ProjectFileScope = { actor: ProjectAccessActor; projectId: string }
export type ProjectFileEntry = {
  path: string
  kind: 'file' | 'directory'
  size: number
  updatedAt: string
}
export interface ProjectFilesApi {
  list(input: ProjectFileScope & { path?: string; depth?: number }): Promise<ProjectFileEntry[]>
  read(input: ProjectFileScope & { path: string }): Promise<{ buffer: Buffer; sha256: string }>
  /** null means create-only. A hash mismatch preserves the current file and rejects. */
  write(
    input: ProjectFileScope & { path: string; buffer: Buffer; expectedHash: string | null }
  ): Promise<{ sha256: string }>
  mkdir(input: ProjectFileScope & { path: string }): Promise<void>
  /** Destination must not exist. Governed Project instructions and skills cannot be moved. */
  move(input: ProjectFileScope & { path: string; destination: string }): Promise<void>
}
export const ProjectFilesRuntimeCapability = createRuntimeCapability<ProjectFilesApi>('platform.project.files', {
  description: 'Authorized Project file tree and conflict-aware atomic file writes.'
})
