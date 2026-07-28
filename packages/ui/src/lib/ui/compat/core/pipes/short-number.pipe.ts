import { DecimalPipe } from '@angular/common'
import { Inject, LOCALE_ID, Pipe, PipeTransform, Type } from '@angular/core'
import { findLocaleData } from '../i18n/locale_data_api'

export enum NgmFormatNumberStyle {
  short = 'short',
  standard = 'standard',
  long = 'long'
}

export enum NgmRoundingMode {
  none = 'none', // 无舍入行为,按照 decimals 或者 shortDecimals 进行 toFixed()
  ceil = 'ceil', // 对数进行上舍入。（向上取整；大于等于x的最小整数）
  floor = 'floor', // 对数进行下舍入。（小于等于x的最大整数）
  round = 'round' // 把数四舍五入为最接近的整数。（对x四舍五入）
}

export const FORMATOPTIONS: NgmFormatOprions = {
  decimals: 2, // 保留几个小数
  // shortDecimals: 2,
  // shortLimit: 1000, // 大于此参数的才进行short
  shortRefNumber: undefined, // 用户自定义的比例因子,默认按照语言文件里面
  // style: NgmFormatNumberStyle.short, // 默认 short 类型 为 short
  // roundingMode: NgmRoundingMode.none, // 舍入行为
  // Delimiter: ',', // 分隔符
  // showDelimiter: true, // 是否启用分隔符
  isformatNumber: true
}

export interface NgmFormatOprions {
  decimals?: number // 保留几个小数
  // shortDecimals?: 2,
  // shortLimit?: number, // 大于此参数的才进行short
  shortRefNumber?: any // 用户自定义的比例因子,默认按照语言文件里面
  // style?: NgmFormatNumberStyle.short, // 默认 short 类型 为 short
  // roundingMode?: NgmRoundingMode, // 舍入行为
  // Delimiter?: ',', // 分隔符
  // showDelimiter?: true, // 是否启用分隔符
  isformatNumber?: boolean
  factor?: number
  shortUnits?: string
}

/**
 * Ref to [CurrencyPipe](https://github.com/angular/angular/blob/11.2.13/packages/common/src/pipes/number_pipe.ts#L163-L287)
 */
@Pipe({
  standalone: true,
  name: 'shortNumber'
})
export class NgmShortNumberPipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private _locale: string) {}

  /**
   * shortNumber pipe
   * @param value 传入的需要进行 short 的数据
   * @param formatOptions short过程中需要用到的参数
   *
   * @returns null 或者 short结果 (例如: 4.53K 5.62万)
   */
  transform(value: number | string, locale?: string, factor?: string, shortUnits?: string): [number, string]
  transform(
    value: number | string | null | undefined,
    locale?: string,
    factor?: string,
    shortUnits?: string
  ): [number, string] {
    if (value === null || value === undefined) {
      return null
    }
    return formatShortNumber(value, locale || this._locale, Number(factor), shortUnits)
  }

  // transform(number: number, args?: any): any {
  //   const value = this._transform(number, args)
  //   return value ? value.join('') : value
  // }

  // _transform(number: number, args?: any): [string, string] {
  //   if (isNaN(number)) {
  //     // will only work value is a number
  //     return null
  //   }
  //   if (number === null) {
  //     return null
  //   }
  //   if (number === 0) {
  //     return ['0', '']
  //   }
  //   let abs = Math.abs(number)
  //   const rounder = Math.pow(10, 1)
  //   const isNegative = number < 0 // will also work for Negetive numbers
  //   let key = ''

  //   const powers = [
  //     { key: 'Q', value: Math.pow(10, 15) },
  //     { key: 'T', value: Math.pow(10, 12) },
  //     { key: 'B', value: Math.pow(10, 9) },
  //     { key: 'M', value: Math.pow(10, 6) },
  //     { key: 'K', value: 1000 },
  //   ]

  //   for (const power of powers) {
  //     let reduced = abs / power.value
  //     reduced = Math.round(reduced * rounder) / rounder
  //     if (reduced >= 1) {
  //       abs = reduced
  //       key = power.key
  //       break
  //     }
  //   }
  //   return [(isNegative ? '-' : '') + abs, key]
  // }
}

/**
 * shorNumber
 * @param value 传入的需要进行 short 的数据
 *
 * @returns null 或者 short结果数组 (例如: ['4.53', 'K'] ['5.62', '万'])
 */
export function formatShortNumber(
  value: number | string,
  locale: string,
  factor?: number,
  shortUnits?: string
): [number, string] {
  try {
    const num = strToNumber(value)
    const localeData = findLocaleData(locale)
    factor = factor || localeData?.shortNumberFactor
    shortUnits = shortUnits || localeData?.shortNumberUnits

    let resultValue = num
    let resultName = ''

    const units = shortUnits?.split(',').reverse()
    units?.every((unitName, i) => {
      const rounder = Math.pow(10, (units.length - i) * factor)
      if (Math.abs(num) >= rounder) {
        resultValue = num / rounder
        resultName = unitName
        return false
      }
      return true
    })

    return [Number(resultValue), resultName]
  } catch (error: any) {
    throw invalidPipeArgumentError(DecimalPipe, error.message)
  }
}

/**
 * Transforms a string into a number (if needed).
 */
function strToNumber(value: number | string): number {
  // Convert strings to numbers
  if (typeof value === 'string' && !isNaN(Number(value) - parseFloat(value))) {
    return Number(value)
  }
  if (typeof value !== 'number') {
    throw new Error(`${value} is not a number`)
  }
  return value
}

export function invalidPipeArgumentError(type: Type<any>, value: Object) {
  return Error(`InvalidPipeArgument: '${value}' for pipe '${stringify(type)}'`)
}

/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

export function stringify(token: any): string {
  if (typeof token === 'string') {
    return token
  }

  if (Array.isArray(token)) {
    return '[' + token.map(stringify).join(', ') + ']'
  }

  if (token == null) {
    return '' + token
  }

  if (token.overriddenName) {
    return `${token.overriddenName}`
  }

  if (token.name) {
    return `${token.name}`
  }

  const res = token.toString()

  if (res == null) {
    return '' + res
  }

  const newLineIndex = res.indexOf('\n')
  return newLineIndex === -1 ? res : res.substring(0, newLineIndex)
}

/**
 * Concatenates two strings with separator, allocating new strings only when necessary.
 *
 * @param before before string.
 * @param separator separator string.
 * @param after after string.
 * @returns concatenated string.
 */
export function concatStringsWithSpace(before: string | null, after: string | null): string {
  return before == null || before === ''
    ? after === null
      ? ''
      : after
    : after == null || after === ''
      ? before
      : before + ' ' + after
}
