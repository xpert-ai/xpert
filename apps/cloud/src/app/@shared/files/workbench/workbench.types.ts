import type { Observable } from 'rxjs'
import type { TChatFileElementReference, TFile, TFileDirectory } from '@xpert-ai/contracts'
import type { FileTreeNode } from '../tree/tree.utils'

export type AsyncValue<T> = T | Promise<T> | Observable<T>

export type FileWorkbenchFilesLoader = (path?: string) => AsyncValue<TFileDirectory[] | null | undefined>
export type FileWorkbenchFileLoader = (path: string) => AsyncValue<TFile | null | undefined>
export type FileWorkbenchFileSaver = (path: string, content: string) => AsyncValue<TFile>
export type FileWorkbenchBinaryFileSaver = (path: string, file: Blob) => AsyncValue<TFile>
export type FileWorkbenchFileDeleter = (path: string) => AsyncValue<void>
export type FileWorkbenchFileUploader = (file: File, path: string) => AsyncValue<unknown>
export type FileWorkbenchDownloadPayload =
  | { kind: 'url'; url: string; fileName?: string }
  | { kind: 'blob'; blob: Blob; fileName?: string }
export type FileWorkbenchFileDownloader = (
  path: string,
  item?: FileTreeNode
) => AsyncValue<FileWorkbenchDownloadPayload | null | undefined>
export type FileWorkbenchCodeReferenceRequest = {
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}
export type FileWorkbenchFilePathReferenceRequest = {
  type: 'file_path'
  path: string
}
export type FileWorkbenchReferenceRequest =
  | FileWorkbenchFilePathReferenceRequest
  | FileWorkbenchCodeReferenceRequest
  | TChatFileElementReference

export type FileWorkbenchLayout = 'default' | 'library'
