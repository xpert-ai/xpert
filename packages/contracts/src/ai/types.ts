import { XpertParameterTypeEnum } from "./xpert.model"

export type TErrorHandling = {
  type?: null | 'defaultValue' | 'failBranch'
  defaultValue?: {content?: string; } & Record<string, any>
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