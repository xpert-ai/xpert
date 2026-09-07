import { DocumentProgressColumnWidth } from './document-progress-column'

describe('Document progress column sizing', () => {
  it('fits the widest status row without changing saved widths or unrelated columns', () => {
    const sizing = new DocumentProgressColumnWidth()
    const shortRow = document.createElement('div')
    const longRow = document.createElement('div')
    const columns = [
      { key: 'name', width: 300, minWidth: 200 },
      { key: 'progress', width: 116, minWidth: 104 }
    ]
    sizing.update(shortRow, 180)
    sizing.update(longRow, 340)
    expect(sizing.fit(columns)).toEqual([columns[0], { key: 'progress', width: 340, minWidth: 340 }])
    expect(columns[1].width).toBe(116)
    sizing.remove(longRow)
    expect(sizing.fit(columns)[1].width).toBe(180)
    sizing.remove(shortRow)
    expect(sizing.fit(columns)[1].width).toBe(116)
  })
  it('preserves a wider user preference and responds to status or language changes', () => {
    const sizing = new DocumentProgressColumnWidth()
    const row = document.createElement('div')
    const columns = [{ key: 'progress', width: 400, minWidth: 104 }]
    sizing.update(row, 220)
    expect(sizing.fit(columns)[0].width).toBe(400)
    sizing.update(row, 520)
    expect(sizing.fit(columns)[0].width).toBe(520)
    sizing.update(row, 180)
    expect(sizing.fit(columns)[0].width).toBe(400)
  })
})
