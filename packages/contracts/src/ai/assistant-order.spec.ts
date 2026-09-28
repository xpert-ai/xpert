import { orderAssistantXperts } from './assistant-order'

describe('assistant order shared by Cloud and Desktop', () => {
  const oldest = { id: 'oldest', createdAt: '2026-01-01T00:00:00Z' }
  const middle = { id: 'middle', createdAt: new Date('2026-01-02T00:00:00Z') }
  const newest = { id: 'newest', createdAt: '2026-01-03T00:00:00Z' }

  it('places newly created assistants first without mutating the input', () => {
    const items = [oldest, newest, middle]
    expect(orderAssistantXperts(items).map((item) => item.id)).toEqual(['newest', 'middle', 'oldest'])
    expect(items).toEqual([oldest, newest, middle])
  })

  it('preserves saved manual order and places new entries above it', () => {
    expect(orderAssistantXperts([oldest, middle, newest], ['oldest', 'missing', 'middle'])).toEqual([
      newest,
      oldest,
      middle
    ])
  })

  it('keeps source order for equal dates and unknown dates, without sorting by name', () => {
    const sameTime = { ...newest, id: 'same-time' }
    const missing = { id: 'z-missing' }
    const invalid = { id: 'a-invalid', createdAt: 'invalid' }
    expect(orderAssistantXperts([missing, newest, invalid, sameTime])).toEqual([newest, sameTime, missing, invalid])
  })
})
