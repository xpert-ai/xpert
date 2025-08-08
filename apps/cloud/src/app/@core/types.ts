import { HttpErrorResponse } from '@angular/common/http'
import { IProject, IUser } from '@metad/contracts'
import { TableColumnType } from '@metad/ocap-core'
import { enUS, zhCN } from 'date-fns/locale'
import ShortUniqueId from 'short-unique-id'
export * from '@metad/contracts'
export {
  convertConnectionResult,
  convertStoryModel,
  convertStoryPointResult,
  convertStoryResult,
  convertStoryWidgetResult
} from '@metad/cloud/state'

export const suuid = new ShortUniqueId({ length: 10 })
export const uid10 = new ShortUniqueId({ length: 10 })
export const uuid = new ShortUniqueId({ length: 10 })
export function letterStartSUID(start: string) {
  return start + uuid()
}

export enum AbilityActions {
  Create = 'Create',
  Manage = 'Manage',
  Read = 'Read'
}

export enum RequestMethodEnum {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  ALL = 'ALL',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

export const LANGUAGES = [
  // { value: 'zh-CN', label: '中文' }, // Is it necessary to keep this or use `zh` ?
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁体中文' },
  { value: 'en', label: 'English' }
]

export interface Group {
  id: string
  name: string
  type: string
  created_at: string
  members: Array<User>
  dataSources: Array<any>
}

export interface User extends IUser {
  password: string
}

export enum MenuCatalog {
  Unknow,
  Project,
  Stories,
  Models,
  Settings,
  IndicatorApp
}

export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err instanceof HttpErrorResponse) {
    if (err?.error?.message) {
      error = err?.error?.message
    } else if (typeof err?.error === 'string') {
      error = err?.error
    } else if(err.message) {
      error = err?.message
    }
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if (typeof err?.message === 'string') {
    error = err?.message
  } else if (err) {
    // 实在没办法则转成 JSON string
    error = JSON.stringify(err)
  }

  // Stringify error object
  if (error && typeof error !== 'string') {
    error = JSON.stringify(error)
  }

  return error
}

// 检测是否为移动设备
export function isMobile() {
  return /Mobi/i.test(navigator.userAgent)
}

// 检测是否为 iOS 设备
export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// 检测是否为 Android 设备
export function isAndroid() {
  return /Android/i.test(navigator.userAgent)
}

export function getDateLocale(locale: string) {
  switch (locale) {
    case 'zh-Hans':
    case 'zh-CN':
    case 'zh':
      return zhCN
    case 'en':
    case 'en-US':
      return enUS
    default:
      return enUS
  }
}

export const DefaultCollection = {
  id: '__default__',
  name: 'Default'
}

export const DefaultProject = {
  id: '__default__',
  name: 'Default'
} as IProject

// 对应 Adapter 中的类型
export interface CreationTable {
  catalog?: string
  table?: string
  name: string
  columns: ColumnDef[]
  data?: any[]
  file?: File
  mergeType?: 'APPEND' | 'DELETE' | 'MERGE'
  format?: 'csv' | 'json' | 'csv_with_names' | 'csv_with_names_and_types' | 'parquet' | 'orc' | 'data'
  columnSeparator?: string
}

export interface ColumnDef {
  /**
   * Key of data object
   */
  name: string
  /**
   * Name of table column
   */
  fieldName: string
  /**
   * Object value type, convert to db type
   */
  type: TableColumnType
  /**
   * Is primary key column
   */
  isKey: boolean
  /**
   * length of type for column: varchar, decimal ...
   */
  length?: number
  /**
   * fraction of type for decimal
   */
  fraction?: number
}

export class NgmError extends Error {
  public code: string
  public date: Date
  constructor(code: string, ...params) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NgmError);
    }

    this.name = "NgmError";
    // Custom debugging information
    this.code = code;
    this.date = new Date();
  }
}

export const WasmDBDialect = 'duckdb'
export const WasmDBDefaultCatalog = 'main'