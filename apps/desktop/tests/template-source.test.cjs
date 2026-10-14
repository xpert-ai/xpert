const { test } = require('node:test')
const assert = require('node:assert/strict')
const { templateSource, sortTemplateSources, templateSourceGroups } = require('../src/catalog/template-source.ts')

test('template sources have independent counts and stable source-first ordering', () => {
  const items = ['builtin', 'plugin', 'shared', 'agent-plugin', 'plugin', 'agent-plugin', 'future-source'].map(
    (source, id) => ({ id: String(id), kind: 'templates', source })
  )
  assert.deepEqual(
    sortTemplateSources(items).map((item) => item.id),
    ['3', '5', '1', '4', '0', '2', '6']
  )
  assert.deepEqual(templateSourceGroups(items), [
    { source: 'agent-plugin', count: 2 },
    { source: 'plugin', count: 2 },
    { source: 'builtin', count: 1 },
    { source: 'shared', count: 1 },
    { source: 'other', count: 1 }
  ])
  assert.equal(templateSource(items[6]), 'other')
  assert.equal(items[0].id, '0')
})
