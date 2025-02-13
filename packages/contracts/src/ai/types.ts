import { BaseMessage } from '@langchain/core/messages'
import { I18nObject } from '../types'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
}

export enum ParameterTypeEnum {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  SELECT = 'select',
  SECRET_INPUT = 'secret-input',
  FILE = 'file'
}

export type TParameterOption = {
  value: string
  label: I18nObject
}

export type TParameter = {
  name: string
  label: I18nObject
  placeholder?: I18nObject
  type: ParameterTypeEnum
  required?: boolean
  default?: number | string
  min?: number
  max?: number
  options?: TParameterOption[]
  items?: {
    type: ParameterTypeEnum
  }

  /**
   * Is visible for parameters
   */
  visible?: boolean
}
