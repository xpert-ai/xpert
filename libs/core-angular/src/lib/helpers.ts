import { isPlatformBrowser } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Inject, Injectable, PLATFORM_ID, DebugElement, EventEmitter } from '@angular/core'
import { compact, PivotColumn, uniqBy } from '@metad/ocap-core'
import { includes, isNil, negate, isEqual, isEmpty, camelCase } from 'lodash-es'
import { Observable } from 'rxjs'
import { filter, takeUntil, tap } from 'rxjs/operators'
import { ZodType, ZodTypeDef } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { isObject } from './utils/shared-utils'
export { nonBlank, nonNullable } from '@metad/ocap-core'


export const filterNil = filter(negate(isNil))
export const isNotEqual = negate(isEqual)
export const isNotEmpty = negate(isEmpty)

/**
 *@hidden
 */
export function cloneArray(array: any[], deep?: boolean) {
  const arr = []
  if (!array) {
    return arr
  }
  let i = array.length
  while (i--) {
    arr[i] = deep ? cloneValue(array[i]) : array[i]
  }
  return arr
}

/**
 * Doesn't clone leaf items
 * @hidden
 */
export function cloneHierarchicalArray(array: any[], childDataKey: any): any[] {
  const result: any[] = []
  if (!array) {
    return result
  }

  for (const item of array) {
    const clonedItem = cloneValue(item)
    if (Array.isArray(item[childDataKey])) {
      clonedItem[childDataKey] = cloneHierarchicalArray(clonedItem[childDataKey], childDataKey)
    }
    result.push(clonedItem)
  }
  return result
}

/**
 * Deep clones all first level keys of Obj2 and merges them to Obj1
 * @param obj1 Object to merge into
 * @param obj2 Object to merge from
 * @returns Obj1 with merged cloned keys from Obj2
 * @hidden
 */
export function mergeObjects(obj1: {}, obj2: {}): any {
  if (!isObject(obj1)) {
    throw new Error(`Cannot merge into ${obj1}. First param must be an object.`)
  }

  if (!isObject(obj2)) {
    return obj1
  }

  for (const key of Object.keys(obj2)) {
    obj1[key] = cloneValue(obj2[key])
  }

  return obj1
}

/**
 * Creates deep clone of provided value.
 * Supports primitive values, dates and objects.
 * If passed value is array returns shallow copy of the array.
 * @param value value to clone
 * @returns Deep copy of provided value
 *@hidden
 */
export function cloneValue(value: any): any {
  if (isDate(value)) {
    return new Date(value.getTime())
  }
  if (Array.isArray(value)) {
    return [...value]
  }

  if (value instanceof Map || value instanceof Set) {
    return value
  }

  if (isObject(value)) {
    const result = {}

    for (const key of Object.keys(value)) {
      result[key] = cloneValue(value[key])
    }
    return result
  }
  return value
}

/**
 * Checks if provided variable is Date
 * @param value Value to check
 * @returns true if provided variable is Date
 *@hidden
 */
export function isDate(value: any) {
  return Object.prototype.toString.call(value) === '[object Date]'
}

/**
 *@hidden
 */
export const enum KEYCODES {
  ENTER = 13,
  SPACE = 32,
  ESCAPE = 27,
  LEFT_ARROW = 37,
  UP_ARROW = 38,
  RIGHT_ARROW = 39,
  DOWN_ARROW = 40,
  F2 = 113,
  TAB = 9,
  CTRL = 17,
  Z = 90,
  Y = 89,
  X = 88,
  BACKSPACE = 8,
  DELETE = 46,
  INPUT_METHOD = 229,
}

/**
 *@hidden
 */
export const enum KEYS {
  ENTER = 'Enter',
  SPACE = ' ',
  SPACE_IE = 'Spacebar',
  ESCAPE = 'Escape',
  ESCAPE_IE = 'Esc',
  LEFT_ARROW = 'ArrowLeft',
  LEFT_ARROW_IE = 'Left',
  UP_ARROW = 'ArrowUp',
  UP_ARROW_IE = 'Up',
  RIGHT_ARROW = 'ArrowRight',
  RIGHT_ARROW_IE = 'Right',
  DOWN_ARROW = 'ArrowDown',
  DOWN_ARROW_IE = 'Down',
  F2 = 'F2',
  TAB = 'Tab',
  SEMICOLON = ';',
  HOME = 'Home',
  END = 'End'
}

/**
 *@hidden
 * Returns the actual size of the node content, using Range
 * ```typescript
 * let range = document.createRange();
 * let column = this.grid.columnList.filter(c => c.field === 'ID')[0];
 *
 * let size = getNodeSizeViaRange(range, column.cells[0].nativeElement);
 * ```
 */
export function getNodeSizeViaRange(range: Range, node: any): number {
  let overflow = null
  if (!isFirefox()) {
    overflow = node.style.overflow
    // we need that hack - otherwise content won't be measured correctly in IE/Edge
    node.style.overflow = 'visible'
  }

  range.selectNodeContents(node)
  const width = range.getBoundingClientRect().width

  if (!isFirefox()) {
    // we need that hack - otherwise content won't be measured correctly in IE/Edge
    node.style.overflow = overflow
  }

  return width
}

/**
 *@hidden
 */
export function isIE(): boolean {
  return navigator.appVersion.indexOf('Trident/') > 0
}
/**
 *@hidden
 */
export function isEdge(): boolean {
  // eslint-disable-next-line no-useless-escape
  const edgeBrowser = /Edge[\/\s](\d+\.\d+)/.test(navigator.userAgent)
  return edgeBrowser
}

/**
 *@hidden
 */
export function isFirefox(): boolean {
  // eslint-disable-next-line no-useless-escape
  const firefoxBrowser = /Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent)
  return firefoxBrowser
}

/**
 * @deprecated
 * @hidden
 */
@Injectable({ providedIn: 'root' })
export class PlatformUtil {
  public isBrowser: boolean = isPlatformBrowser(this.platformId)

  public isIOS =
    this.isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}
}

/**
 * @hidden
 */
export function isLeftClick(event: PointerEvent) {
  return event.button === 0
}

/** @hidden */
export function isNavigationKey(key: string): boolean {
  return (
    [
      'down',
      'up',
      'left',
      'right',
      'arrowdown',
      'arrowup',
      'arrowleft',
      'arrowright',
      'home',
      'end',
      'space',
      'spacebar',
      ' ',
    ].indexOf(key) !== -1
  )
}

export const NAVIGATION_KEYS = new Set([
  'down',
  'up',
  'left',
  'right',
  'arrowdown',
  'arrowup',
  'arrowleft',
  'arrowright',
  'home',
  'end',
  'space',
  'spacebar',
  ' ',
])
export const ROW_EXPAND_KEYS = new Set('right down arrowright arrowdown'.split(' '))
export const ROW_COLLAPSE_KEYS = new Set('left up arrowleft arrowup'.split(' '))
export const SUPPORTED_KEYS = new Set([
  ...Array.from(NAVIGATION_KEYS),
  'tab',
  'enter',
  'f2',
  'escape',
  'esc',
])

/**
 * @hidden
 * @internal
 *
 * Creates a new ResizeObserver on `target` and returns it as an Observable.
 * Run the resizeObservable outside angular zone, because it patches the MutationObserver which causes an infinite loop.
 * Related issue: https://github.com/angular/angular/issues/31712
 */
export function resizeObservable(target: HTMLElement): Observable<ResizeObserverEntry[]> {
  return new Observable((observer) => {
    const instance = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      observer.next(entries)
    })
    instance.observe(target)
    const unsubscribe = () => instance.disconnect()
    return unsubscribe
  })
}

/**
 * @deprecated use `booleanAttribute` instead
 */
export function convertToBoolProperty(val: any): boolean {
  if (typeof val === 'string') {
    val = val.toLowerCase().trim()

    return val === 'true' || val === ''
  }

  return !!val
}

/** Button events to pass to `DebugElement.triggerEventHandler` for RouterLink event handler */
export const ButtonClickEvents = {
  left: { button: 0 },
  right: { button: 2 },
}

/** Simulate element click. Defaults to mouse left-button click event. */
export function click(
  el: DebugElement | HTMLElement,
  eventObj: any = ButtonClickEvents.left
): void {
  if (el instanceof HTMLElement) {
    el.click()
  } else {
    el.triggerEventHandler('click', eventObj)
  }
}

export function makeid(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const characters = chars + '0123456789'
  const charactersLength = characters.length
  // 首字母为英文字符
  let result = chars.charAt(Math.floor(Math.random() * chars.length))
  for (let i = 0; i < length - 1; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

export const mkenum = <T extends { [index: string]: U }, U extends string>(x: T) => x;


// Search options
export function includeIgnoreCase(text, target) {
  const keywords: Array<string> = target.split(/\s+/g)
  const matchs = String(text).match(new RegExp(`(${keywords.join('|')})`, 'ig'))
  return matchs
}

/**
 * 分解高亮字符串
 * 
 * @param text 
 * @param highlight 
 * @returns 
 */
export function splitByHighlight(text, highlight): Array<{value: string, match?: boolean}> {
  if (highlight && text) {
    const keywords: Array<string> = highlight.split(/\s+/g)
    const matchs = String(text).match(new RegExp(`(${keywords.join('|')})`, 'ig'))
    const results = String(text).split(new RegExp(`(${keywords.join('|')})`, 'i'))
    if (results?.length > 1) {
      return results.map(value => includes(matchs, value) ? {match: true, value} : {value})
    }
  }

  return [{value: text}]
}

export function createEventEmitter<T>(
  observable: Observable<T>,
  options?: {
    unsubscribe?: Observable<any>;
    isAsync?: boolean;
  },
): EventEmitter<T> {
  const { unsubscribe, isAsync } = options || {};

  const emitter = new EventEmitter<T>(isAsync === true);

  let obs = observable.pipe(tap(val => emitter.next(val)));

  if (unsubscribe != null) {
    obs = obs.pipe(takeUntil(unsubscribe));
  }

  obs.subscribe();

  return emitter;
}

// export function omitBlank(obj) {
//   if (Array.isArray(obj)) {
//     return obj.map(value => omitBlank(value))
//   } else if (typeof obj === "object") {
//     return Object.entries(obj)
//       .filter(([, v]) => !isBlank(v))
//       .reduce((r, [key, value]) => ({ ...r, [key]: omitBlank(value) }), {})
//   }
//   else {
//     return obj
//   }
// }

// Table to csv format
export function convertTableToCSV(columns, data) {
  return columns.map((column) => column.caption || column.name).join(',') + `\n` + 
          data.map((row) => columns.map((column) => row[column.name]).join(',')).join('\n')
}

export function flatPivotColumns(columns: PivotColumn[]) {
  const flatColumns = []
  const flatColumn = (column: PivotColumn, parentName: string) => {
    if (column.columns?.length) {
      column.columns.forEach((item) => flatColumn(item, column.caption))
    } else {
      flatColumns.push({
        ...column,
        caption: compact([parentName, column.caption]).join('/') // (parentName ? `${parentName}/` : '') + (column.label ?? '')
      })
    }
  }

  columns?.forEach((item) => flatColumn(item, null))

  return flatColumns
}

export function convertQueryResultColumns(schema) {
  const columns = []
  schema?.rows?.forEach((row) => {
    columns.push(row)
    if (row.text) {
      columns.push(row.text)
    }
    columns.push(...(row.properties ?? []))
  })

  columns.push(...flatPivotColumns(schema?.columns))

  return uniqBy(columns, 'name')
}

export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err instanceof HttpErrorResponse) {
    error = err?.error?.message ?? err.message
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if (err) {
    // 实在没办法则转成 JSON string
    error = JSON.stringify(err)
  }

  return error
}

/**
 * Copilot
 */
export function zodToProperties(obj: ZodType<any, ZodTypeDef, any>,) {
  return (<{ properties: any }>zodToJsonSchema(obj)).properties
}

/**
 * Convert snake case object to camel case
 * 
 * @param obj 
 * @returns 
 */
export function camelCaseObject(obj: Record<string, any>) {
  const newObj: Record<string, any> = {}

  for (const key in obj) {
    newObj[camelCase(key)] = obj[key]
  }

  return newObj
}

export type WorkBook = any
export async function readExcelWorkSheets<T = unknown>(file: File) {
  const XLSX = await import('xlsx')
  return new Promise<{fileName: string; name: string; columns: any[]; data: T[]}[]>((resolve, reject) => {
    const reader: FileReader = new FileReader()

    reader.onload = async (e: any) => {
      const data: ArrayBuffer = e.target.result
      let wBook: WorkBook
      if (file.type === 'text/csv') {
        const decoder = new TextDecoder('utf-8')
        const decodedData = decoder.decode(data)
        wBook = XLSX.read(decodedData, { type: 'string' })
      } else {
        wBook = XLSX.read(data, { type: 'array' })
      }

      try {
        resolve(await readExcelJson(wBook, file.name))
      } catch (err) {
        reject(err)
      }
    }

    reader.readAsArrayBuffer(file)
  })
}

export async function readExcelJson<T = unknown>(wSheet: WorkBook, fileName = ''): Promise<{fileName: string; name: string; columns: any[]; data: T[]}[]> {
  const XLSX = await import('xlsx')

  const name = fileName
    .replace(/\.xlsx$/, '')
    .replace(/\.xls$/, '')
    .replace(/\.csv$/, '')

  // AOA : array of array
  type AOA = any[][]

  // const sheetCellRange = XLSX.utils.decode_range(wSheet['!ref'])
  // const sheetMaxRow = sheetCellRange.e.r

  return wSheet.SheetNames.map((sheetName) => {
    const origExcelData = <AOA>XLSX.utils.sheet_to_json(wSheet.Sheets[sheetName], {
      header: 1,
      range: wSheet['!ref'],
      raw: true
    })

    const refExcelData = origExcelData.slice(1).map((value) => Object.assign([], value))
    const excelTransformNum = origExcelData[0].map((col) => `${col}`.trim())

    /* Combine to JSON */
    const excelDataEncodeToJson = refExcelData.slice(0).map((item, row) =>
      item.reduce((obj, val, i) => {
        if (!excelTransformNum[i]) {
          throw new Error(`No column name found for cell at row ${row + 2}, column ${i + 1}`)
        }
        obj[excelTransformNum[i].trim()] = val
        return obj
      }, {})
    )

    const columns = excelTransformNum.map((column, i) => {
      const item = excelDataEncodeToJson.find((item) => typeof item[column] !== 'undefined')
      return {
        name: column,
        fieldName: column,
      }
    })

    return {
      fileName,
      name: wSheet.SheetNames.length > 1 ? sheetName : name,
      columns: columns.filter((col) => !!col),
      data: excelDataEncodeToJson,
    }
  })
}