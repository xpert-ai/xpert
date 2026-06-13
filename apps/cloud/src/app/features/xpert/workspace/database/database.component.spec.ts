import {
  COLUMN_DEFAULT_VALUE_NONE,
  applyColumnDefaultValueSelection,
  columnDefaultValueSelectValue
} from './database-default-value'

describe('database column default value select adapter', () => {
  it('maps an empty default value to a selectable sentinel', () => {
    expect(columnDefaultValueSelectValue({ defaultValue: undefined })).toBe(COLUMN_DEFAULT_VALUE_NONE)
  })

  it('clears the column default value when the none option is selected', () => {
    const column = { defaultValue: 'CURRENT_TIMESTAMP' }

    applyColumnDefaultValueSelection(column, COLUMN_DEFAULT_VALUE_NONE)

    expect(column.defaultValue).toBeUndefined()
  })

  it('keeps supported database function default values unchanged', () => {
    const column = { defaultValue: undefined }

    applyColumnDefaultValueSelection(column, 'uuid_generate_v4()')

    expect(column.defaultValue).toBe('uuid_generate_v4()')
  })
})
