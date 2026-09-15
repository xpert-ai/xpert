import { KnowledgeTableDefinition } from '@xpert-ai/contracts'
import { remapTableIndexedFields } from './table-index-selection'

describe('table index selection across header changes', () => {
  const table = (tableId: string, keys: string[]): KnowledgeTableDefinition => ({
    tableId,
    sheetName: tableId,
    range: 'A1:B3',
    rowCount: 2,
    columns: keys.map((key, index) => ({ columnId: ['A', 'B'][index], column: index + 1, key, label: key }))
  })

  it('uses table and column identities even if sheets and columns are returned in a different order', () => {
    const before = [table('sheet:0', ['sku', 'price']), table('sheet:1', ['sku', 'count'])]
    const after = [table('sheet:1', ['A', 'B']), table('sheet:0', ['A', 'B'])]
    after.forEach((table) => table.columns.reverse())
    expect(remapTableIndexedFields(['sku'], before, after)).toEqual(['A'])
  })

  it('does not silently select an additional column on a different sheet', () => {
    const before = [table('sheet:0', ['sku', 'price']), table('sheet:1', ['price', 'sku'])]
    const after = [table('sheet:0', ['A', 'B']), table('sheet:1', ['A', 'B'])]
    // A global [A, B] would widen each sheet from one selected column to both columns.
    expect(remapTableIndexedFields(['sku'], before, after)).toBeNull()
  })

  it('does not collapse different columns with the same new header into a broader selection', () => {
    const before = [table('sheet:0', ['A', 'B']), table('sheet:1', ['A', 'B'])]
    const after = [table('sheet:0', ['sku', 'price']), table('sheet:1', ['price', 'sku'])]
    expect(remapTableIndexedFields(['A'], before, after)).toBeNull()
  })

  it('rejects unknown old fields instead of discarding them', () => {
    expect(
      remapTableIndexedFields(['sku', 'missing'], [table('sheet:0', ['sku', 'price'])], [table('sheet:0', ['A', 'B'])])
    ).toBeNull()
  })

  it('rejects disappearing selected columns and sheets', () => {
    const before = [table('sheet:0', ['sku', 'price'])]
    expect(remapTableIndexedFields(['price'], before, [table('sheet:0', ['A'])])).toBeNull()
    expect(remapTableIndexedFields(['sku'], before, [])).toBeNull()
  })

  it('can map a shared new key when every affected physical column was already selected', () => {
    const before = [table('sheet:0', ['sku', 'price']), table('sheet:1', ['item', 'count'])]
    expect(
      remapTableIndexedFields(['sku', 'item'], before, [table('sheet:0', ['A', 'B']), table('sheet:1', ['A', 'B'])])
    ).toEqual(['A'])
  })
})
