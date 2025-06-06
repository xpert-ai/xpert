import { XpertParameterTypeEnum } from "./xpert.model"

export type TErrorHandling = {
  type?: null | 'defaultValue' | 'failBranch'
  defaultValue?: {content?: string}
  failBranch?: string
}

export enum ApiAuthType {
  /**
   * Enum class for api provider auth type.
   */
  NONE = "none",
  API_KEY = "api_key",
  BASIC = 'basic'
}

export type TFile = {
  filePath: string;
  fileType: string;
  contents: string;
  description: string;
  size?: number
  createdAt?: Date
  url?: string

  storageFileId?: string
}

/**
 * Reference variable (parameter)
 */
export type TXpertRefParameter = {
  type?: XpertParameterTypeEnum
  name: string
  optional?: boolean
  /**
   * Referencing other variable
   */
  variable?: string
}