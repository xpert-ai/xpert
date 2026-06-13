export const COLUMN_DEFAULT_VALUE_NONE = '__xpert_column_default_value_none__'

type ColumnDefaultValueHolder = {
  defaultValue?: string | null
}

type ColumnDefaultValueSelection = string | number | readonly (string | number)[] | null | undefined

export function columnDefaultValueSelectValue(column: ColumnDefaultValueHolder): string {
  const defaultValue = column.defaultValue?.trim()
  return defaultValue ? defaultValue : COLUMN_DEFAULT_VALUE_NONE
}

export function applyColumnDefaultValueSelection(
  column: ColumnDefaultValueHolder,
  selectedValue: ColumnDefaultValueSelection
): void {
  const value = Array.isArray(selectedValue) ? selectedValue[0] : selectedValue

  if (value === COLUMN_DEFAULT_VALUE_NONE || value === undefined || value === null || value === '') {
    column.defaultValue = undefined
    return
  }

  column.defaultValue = String(value)
}
