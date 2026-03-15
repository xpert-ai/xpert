import type { ZardTableSizeVariants, ZardTableSortDirection } from '@xpert-ai/headless-ui'
import { DisplayDensity } from '@metad/ocap-angular/core'
import get from 'lodash-es/get'

export interface TableSortState {
  active: string | null
  direction: ZardTableSortDirection
}

export function filterTableRowsByColumn<T>(
  rows: T[],
  column: string | null,
  filterText: string,
  accessor: (row: T, columnName: string) => unknown = defaultAccessor
): T[] {
  const normalizedFilter = normalizeTableSearchValue(filterText)
  if (!normalizedFilter || !column) {
    return rows
  }

  return rows.filter((row) => normalizeTableSearchValue(accessor(row, column)).includes(normalizedFilter))
}

export function filterTableRowsByColumns<T>(
  rows: T[],
  columns: string[],
  filterText: string,
  accessor: (row: T, columnName: string) => unknown = defaultAccessor
): T[] {
  const normalizedFilter = normalizeTableSearchValue(filterText)
  if (!normalizedFilter) {
    return rows
  }

  return rows.filter((row) =>
    columns.some((column) => normalizeTableSearchValue(accessor(row, column)).includes(normalizedFilter))
  )
}

export function sortTableRows<T>(
  rows: T[],
  sort: TableSortState,
  accessor: (row: T, columnName: string) => unknown = defaultAccessor
): T[] {
  if (!sort.active || !sort.direction) {
    return rows
  }

  return [...rows].sort((left, right) => {
    const result = compareTableValues(accessor(left, sort.active), accessor(right, sort.active))
    return sort.direction === 'asc' ? result : -result
  })
}

export function paginateTableRows<T>(rows: T[], pageIndex: number, pageSize: number): T[] {
  if (!pageSize || pageSize <= 0) {
    return rows
  }

  const start = Math.max(pageIndex, 0) * pageSize
  return rows.slice(start, start + pageSize)
}

export function normalizeTableSearchValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).toLowerCase()
  }

  if (value instanceof Date) {
    return value.toISOString().toLowerCase()
  }

  return JSON.stringify(value).toLowerCase()
}

export function parseTableWidthToPx(width: string | undefined | null, fallback: number): number {
  if (!width) {
    return fallback
  }

  const normalizedWidth = width.trim()
  if (!normalizedWidth) {
    return fallback
  }

  if (/^-?\d+(\.\d+)?$/.test(normalizedWidth)) {
    return Number(normalizedWidth)
  }

  if (normalizedWidth.endsWith('px')) {
    return Number.parseFloat(normalizedWidth)
  }

  if (normalizedWidth.endsWith('rem')) {
    return Number.parseFloat(normalizedWidth) * 16
  }

  return fallback
}

export function displayDensityToTableSize(displayDensity: DisplayDensity | string | null | undefined): ZardTableSizeVariants {
  switch (displayDensity) {
    case DisplayDensity.comfortable:
      return 'comfortable'
    case DisplayDensity.compact:
      return 'compact'
    case DisplayDensity.cosy:
    default:
      return 'default'
  }
}

function compareTableValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0
  }

  if (left === null || left === undefined) {
    return 1
  }

  if (right === null || right === undefined) {
    return -1
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime()
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

function defaultAccessor<T>(row: T, columnName: string) {
  return get(row, columnName)
}
