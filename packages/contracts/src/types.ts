import ShortUniqueId from 'short-unique-id'

export const uuid = new ShortUniqueId({ length: 10 })

/**
 * @description
 * An entity ID. Represents a unique identifier as a string.
 *
 * @docsCategory Type Definitions
 * @docsSubcategory Identifiers
 */
export type ID = string;

export interface I18nObject {
  en_US: string
  zh_Hans?: string
}

export type TAvatar = {
  emoji?: {
    id: string
    set?: '' | 'apple' | 'google' | 'twitter' | 'facebook'
    colons?: string
    unified?: string
  }
  /**
   * Use Noto Color Emoji:
   * https://fonts.google.com/noto/specimen/Noto+Color+Emoji/
   */
  useNotoColor?: boolean
  background?: string
  url?: string
}

export type TDeleteResult = {
  /**
   * Raw SQL result returned by executed query.
   */
  raw: any;
  /**
   * Number of affected rows/documents
   * Not all drivers support this
   */
  affected?: number | null;
}

export type TranslateOptions = {
	lang?: string;
  args?: ({
      [k: string]: any;
  } | string)[] | {
      [k: string]: any;
  };
  debug?: boolean;
}

/**
 * Select option type
 */
export type TSelectOption<T = string | number | boolean, K = string> = {
  key?: K
  value: T

  label?: I18nObject | string
  description?: I18nObject | string
  icon?: string
}

// Parameters
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

export type TParameterHelpInfo = {
  title: I18nObject;
  url: I18nObject;
}

export type TParameter = {
  name: string
  label: I18nObject
  placeholder?: I18nObject
  description?: I18nObject
  type: ParameterTypeEnum
  required?: boolean
  default?: number | string
  min?: number
  max?: number
  options?: TParameterOption[]
  items?: {
    type: ParameterTypeEnum
  }
  when?: Record<string, unknown[]>

  /**
   * Is visible for parameters
   */
  visible?: boolean

  help?: TParameterHelpInfo
}

export type TParameterSchema = {
  type: 'object' | 'array'
  required?: string[]
  secret?: string[]
  /**
   * @deprecated use parameters
   */
  properties?: any
  parameters?: TParameter[]
}

export interface IPoint {
  x: number
  y: number
}

export interface ISize {
  width: number
  height: number
}

export type _TFile = {
  filePath: string;
  fileUrl?: string;
  /**
   * @deprecated use fileUrl instead
   */
  url?: string;
}

/**
 * A recursive implementation of the Partial<T> type.
 * Source: https://stackoverflow.com/a/49936686/772859
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends Readonly<infer U>[]
      ? Readonly<DeepPartial<U>>[]
      : DeepPartial<T[P]>
}

export interface ChecklistItem {
  node?: string
	field?: string // Incorrect field name, such as role, hierarchy
  value?: string // Optional: value of the field, such as role name
	message: I18nObject
	level: 'error' | 'warning'
	ruleCode?: string // Optional: unique internal rule number (such as DIM_ROLE_INVALID)
}

export interface RuleValidator {
	validate(input: any, params?: any): Promise<ChecklistItem[]>
}

export function letterStartSUID(start: string) {
  return start + uuid()
}