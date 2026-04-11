import { TI18N } from "./i18n"

export interface ISelectOption<T = unknown> {
  key?: string
  /**
   * @deprecated use key
   * 
   * The value object of the option
   */
  value?: T
  /**
   * @deprecated use caption
   */
  label?: string
  caption?: string
  selected?: boolean
  icon?: string
}

/**
 * 树状结构的选择模式
 */
export enum TreeSelectionMode {
  Individual = 'Individual', // 每个节点独立选择
  ParentOnly = 'ParentOnly', // 只输出 Parent
  LeafOnly = 'LeafOnly', // 只输出 Leaf
  ParentChild = 'ParentChild' // 输出所有选中的 Parent 和 Children
}

/**
 * New select option type
 */
export type TSelectOption<T = string | number | boolean, K = string> = {
  key?: K
  value: T

  label?: TI18N | string
  icon?: string
  description?: TI18N | string
}

export type TSelectOptionCompareWith<T> = (a: T, b: T) => boolean

const defaultCompareWith = <T>(a: T, b: T) => a === b

export function formatSelectOptionValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`
  }

  if (typeof value === 'object') {
    if ('id' in value && value.id != null) {
      return `${value.id}`
    }
    if ('key' in value && value.key != null) {
      return `${value.key}`
    }
    if ('name' in value && value.name != null) {
      return `${value.name}`
    }
    if ('label' in value && value.label != null) {
      return `${value.label}`
    }

    try {
      return JSON.stringify(value)
    } catch {
      return `${value}`
    }
  }

  return `${value}`
}

export function compareSelectOptionValue<T>(
  a: T,
  b: T,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): boolean {
  return compareWith(a, b)
}

export function hasSelectOptionValue<T>(
  values: readonly T[] | null | undefined,
  value: T,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): boolean {
  return values?.some((item) => compareSelectOptionValue(item, value, compareWith)) ?? false
}

export function findMissingSelectOptionValues<T>(
  values: readonly T[] | null | undefined,
  options: readonly TSelectOption<T>[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): T[] {
  if (!values?.length) {
    return []
  }

  return values.filter(
    (value) => !options?.some((option) => compareSelectOptionValue(option.value, value, compareWith))
  )
}

export function mergeSelectedValues<T>(
  options: readonly T[] | null | undefined,
  values: readonly T[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith
): T[] {
  const merged = [...(options ?? [])]

  values?.forEach((value) => {
    if (!merged.some((option) => compareSelectOptionValue(option, value, compareWith))) {
      merged.push(value)
    }
  })

  return merged
}

export function buildListboxOptions<T>(
  options: readonly TSelectOption<T>[] | null | undefined,
  values: readonly T[] | null | undefined,
  compareWith: TSelectOptionCompareWith<T> = defaultCompareWith,
  missingDescription = 'Current value not found, please reselect or clear'
): TSelectOption<T>[] {
  const listboxOptions = [...(options ?? [])]
  const missingValues = findMissingSelectOptionValues(values, listboxOptions, compareWith)

  missingValues.forEach((value, index) => {
    if (!listboxOptions.some((option) => compareSelectOptionValue(option.value, value, compareWith))) {
      const text = formatSelectOptionValue(value)
      listboxOptions.push({
        key: `__missing__:${text}:${index}` as string,
        value,
        label: text,
        description: missingDescription
      })
    }
  })

  return listboxOptions
}
