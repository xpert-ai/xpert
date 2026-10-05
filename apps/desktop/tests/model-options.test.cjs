const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { Module } = require('node:module')
const ts = require('typescript')
const compiled = new Module(__filename, module)
compiled._compile(
  ts.transpileModule(readFileSync(join(__dirname, '../src/catalog/model-options.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  __filename
)
const { providerGroups, matchesModel, rankModels, isComputerModel, modelTags } = compiled.exports
const model = (id, provider, features = []) => ({
  id,
  label: 'Shared model',
  provider: { id: provider, label: provider },
  copilotModel: { copilotId: id, model: 'native-model', modelType: 'llm' },
  features
})
test('provider cascade keeps same-name models and separate authorized connections', () => {
  const entries = [
    model('one', 'Provider A'),
    model('two', 'Provider B'),
    { ...model('three', 'Provider A'), connectionName: 'Team connection' }
  ]
  assert.deepEqual(
    providerGroups(entries).map((group) => group.models.map((item) => item.id)),
    [['one', 'three'], ['two']]
  )
  assert.equal(matchesModel(entries[2], 'provider a team'), true)
  assert.equal(matchesModel(entries[1], 'native-model'), true)
  assert.equal(matchesModel(entries[1], 'team'), false)
  assert.equal(matchesModel(entries[0], '  '), true)
})
test('cloud recommendation uses declared capabilities and preserves organization default within compatible choices', () => {
  const entries = [
    model('default', 'A', ['tool-call']),
    model('vision', 'A', ['vision', 'multi-tool-call']),
    model('vision-default', 'B', ['vision', 'tool-call'])
  ]
  assert.deepEqual(
    rankModels(entries, true, 'default').map((item) => item.id),
    ['vision', 'vision-default', 'default']
  )
  assert.equal(rankModels(entries, true, 'vision-default')[0].id, 'vision-default')
  assert.equal(rankModels(entries, false, 'default')[0].id, 'default')
  assert.equal(isComputerModel({ ...entries[0], label: 'Vision model', features: [] }), false)
  assert.equal(isComputerModel(model('no-tools', 'A', ['vision'])), false)
})
test('legacy metadata is safe and capability badges show only actual model properties', () => {
  const legacy = { id: 'legacy', label: 'Vision 128K', copilotModel: { model: 'legacy' } }
  assert.deepEqual(modelTags(legacy), [])
  assert.equal(isComputerModel(legacy), false)
  assert.equal(providerGroups([legacy])[0].id, '')
  const tags = modelTags({
    ...model('rich', 'A', ['vision', 'tool-call', 'multi-tool-call', 'agent-thought']),
    contextWindow: 128000
  })
  assert.deepEqual(
    tags.map((tag) => tag.label),
    ['{{size}} context', 'Vision', 'Parallel tools', 'Reasoning']
  )
  assert.equal(tags[0].value, '128K')
})
