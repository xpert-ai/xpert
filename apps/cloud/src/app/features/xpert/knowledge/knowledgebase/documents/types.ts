import { IKnowledgeDocument } from "@cloud/app/@core/types"

/**
 * @deprecated
 */
export type TFileItem = {
  // storageFile?: IStorageFile
  file: File
  doc?: IKnowledgeDocument
  // extension: string
  loading?: boolean
  progress?: number
  error?: string
}