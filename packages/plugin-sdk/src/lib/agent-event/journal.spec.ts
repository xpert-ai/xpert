import { PluginEventJournal, agentEventDigest } from './journal'

const journal = new PluginEventJournal('plugin_test_event')
const route = { binding: 'binding', revision: 3, enabled: true }
const snapshot = { price: 42 }
const source = {
  sourceEventId: 'delivery-1',
  type: 'quote.revised',
  schemaVersion: 1,
  occurredAt: '2026-01-01T10:00:00Z',
  subject: { kind: 'quote', key: 'quote-1' }
}
const original = {
  ...source,
  bindingRevision: route.revision,
  fact: { key: 'fact-1', revision: 'r1', sha256: agentEventDigest(snapshot) }
}

describe('PluginEventJournal.capture redelivery', () => {
  const tx = { query: jest.fn() }

  beforeEach(() => {
    tx.query.mockReset().mockResolvedValue([{ event: original }])
  })

  it('reuses the first capture when the same fact is received again later', async () => {
    const replay = { ...source, occurredAt: '2026-01-01T10:05:00Z' }
    await expect(journal.capture(tx, route, replay, snapshot, 'fact-1', 'r1')).resolves.toBe(true)
    expect(tx.query).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['fact.key', source, snapshot, 'fact-2', 'r1'],
    ['fact.revision', source, snapshot, 'fact-1', 'r2'],
    ['schemaVersion', { ...source, schemaVersion: 2 }, snapshot, 'fact-1', 'r1'],
    ['type', { ...source, type: 'quote.withdrawn' }, snapshot, 'fact-1', 'r1'],
    ['subject.kind', { ...source, subject: { ...source.subject, kind: 'order' } }, snapshot, 'fact-1', 'r1'],
    ['subject.key', { ...source, subject: { ...source.subject, key: 'quote-2' } }, snapshot, 'fact-1', 'r1'],
    ['snapshot digest', source, { price: 43 }, 'fact-1', 'r1']
  ] as const)('reports a conflict when only %s changes', async (_field, event, data, key, revision) => {
    await expect(journal.capture(tx, route, event, data, key, revision)).rejects.toThrow('event_source_conflict')
    expect(tx.query).toHaveBeenCalledTimes(1)
  })
})
