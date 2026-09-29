const { test } = require('node:test')
const assert = require('node:assert/strict')
const { catalogBusinessAreas, matchesBusinessArea } = require('../src/catalog/business-area-filter.ts')

test('business domains filter by ID and combine with broad categories without losing available domains', () => {
  const items = [
    { id: 'a', kind: 'experts', businessArea: { id: 'sales', name: 'Sales' }, categories: ['productivity'] },
    { id: 'b', kind: 'experts', businessArea: { id: 'sales', name: 'Sales' }, categories: ['communication'] },
    { id: 'c', kind: 'experts', businessArea: { id: 'finance', name: 'Finance' }, categories: ['productivity'] },
    { id: 'd', kind: 'experts', categories: ['productivity'] }
  ]
  assert.deepEqual(catalogBusinessAreas(items), [
    { id: 'finance', name: 'Finance' },
    { id: 'sales', name: 'Sales' }
  ])
  assert.deepEqual(
    items
      .filter((item) => matchesBusinessArea(item, 'sales') && item.categories.includes('productivity'))
      .map((item) => item.id),
    ['a']
  )
  assert.equal(items.filter((item) => matchesBusinessArea(item, null)).length, 4)
  assert.equal(matchesBusinessArea(items[3], 'sales'), false)
})
