const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { app, defaultResult } = require('./discovery-catalog.cjs')

module.exports = (mountCatalog) => {
  const choose = async (view, key, value) => {
    const select = document.getElementById('organization-field-' + key)
    await React.act(async () => {
      select.value = value
      select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
    })
  }
  const setup = (application, fields) => ({
    application: { ...application, installationScope: 'organization' },
    canInitialize: true,
    canConfigure: true,
    organizationFields: fields,
    embeddingModels: [],
    visionModels: [],
    toolsetRequirements: []
  })

  test('first installation requires active organization approvers and submits the saved revision', async (t) => {
    const field = { kind: 'members', key: 'sales', label: 'Sales reviewers', optional: false }
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(app, [field, { ...field, key: 'publisher', optional: true }])
      if (method === 'applicationOrganizationSettings')
        return {
          settings: { revision: 0, members: {}, queries: {} },
          users: [
            { id: 'human', label: 'Reviewer' },
            { id: 'other', label: 'Second' }
          ],
          sources: []
        }
      if (method === 'initializeApplication') return { botId: 'new-assistant' }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    const submit = document.querySelector('form button[type=submit]')
    assert.ok(submit.disabled)
    await choose(view, 'sales', 'other')
    await choose(view, 'sales', 'human')
    assert.ok(document.getElementById('organization-field-sales').disabled)
    await view.click('Second')
    assert.deepEqual(
      Array.from(document.getElementById('organization-field-sales').options, (opt) => opt.value),
      ['', 'other']
    )
    assert.equal(submit.disabled, false)
    await view.click('Install & use')
    const input = view.calls.find((c) => c.method === 'initializeApplication').input
    assert.equal(
      input.organizationId,
      view.calls.find((c) => c.method === 'applicationOrganizationSettings').input.organizationId
    )
    assert.deepEqual(JSON.parse(JSON.stringify(input.organizationSettings)), {
      revision: 0,
      members: { sales: ['human'], publisher: [] },
      queries: {}
    })
  })

  test('ready app keeps its open action and completes queries in place using the authorized source version', async (t) => {
    const item = { ...app, status: 'ready', botId: 'original' }
    const field = {
      key: 'review',
      kind: 'analytics',
      label: 'Review',
      providerId: 'example',
      requiredNumericFields: ['actual', 'budget']
    }
    const source = { kind: 'definition', definitionId: 'selected', versionId: 'published' }
    const old = { kind: 'definition', definitionId: 'old', versionId: 'revoked' }
    const binding = {
      id: 'review',
      source: old,
      providerId: 'example',
      operation: 'action',
      contractVersion: 1,
      payload: {},
      parameters: [],
      output: {
        fields: [
          { id: 'actual', logicalType: 'decimal' },
          { id: 'budget', logicalType: 'float64' }
        ]
      }
    }
    let revision = 2
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(item, [field])
      if (method === 'applicationOrganizationSettings')
        return {
          settings: { revision, members: {}, queries: { review: binding } },
          users: [],
          sources: [{ source, name: 'Shared definition', providers: [{ id: 'example' }] }]
        }
      if (method === 'saveApplicationOrganizationSettings') return { revision: ++revision }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    assert.equal(view.count('applicationOrganizationSettings'), 0)
    await view.click('Edit organization settings')
    const submit = document.querySelector('form button[type=submit]')
    assert.ok(submit.disabled, 'a revoked source is not automatically replaced')
    await choose(view, 'review', JSON.stringify([source.definitionId, source.versionId]))
    assert.equal(submit.disabled, false)
    await view.click('Save organization settings')
    const input = view.calls.find((c) => c.method === 'saveApplicationOrganizationSettings').input
    assert.equal(input.organizationSettings.revision, 2)
    assert.deepEqual(JSON.parse(JSON.stringify(input.organizationSettings.queries.review.source)), source)
    assert.equal(view.count('initializeApplication'), 0)
    assert.ok(document.querySelector('form').textContent.includes('Open assistant'))
  })
  test('degraded existing installations save through configuration only and keep edits on a revision conflict', async (t) => {
    const item = { ...app, status: 'degraded', botId: 'existing' }
    const fields = [{ kind: 'members', key: 'engineering', label: 'Engineering approvers', optional: false }]
    let revision = 1
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(item, fields)
      if (method === 'applicationOrganizationSettings')
        return {
          settings: { revision, members: { engineering: ['old-user'] }, queries: {} },
          users: [{ id: 'current', label: 'Current reviewer' }],
          sources: []
        }
      if (method === 'saveApplicationOrganizationSettings') {
        if (revision === 1) {
          revision = 2
          throw Error('Settings changed. Refresh.')
        }
        return { revision: 3 }
      }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    const submit = () => document.querySelector('form button[type=submit]')
    assert.ok(submit().disabled)
    await choose(view, 'engineering', 'current')
    await view.click('Save organization settings')
    assert.match(document.querySelector('[role=alert]').textContent, /Refresh/)
    assert.ok(
      document
        .getElementById('organization-field-engineering')
        .closest('fieldset')
        .textContent.includes('Current reviewer')
    )
    assert.ok(document.getElementById('organization-field-engineering').disabled)
    await view.click('Refresh settings')
    assert.ok(submit().disabled)
    await choose(view, 'engineering', 'current')
    await view.click('Save organization settings')
    assert.deepEqual(
      view.calls
        .filter((c) => c.method === 'saveApplicationOrganizationSettings')
        .map((c) => c.input.organizationSettings.revision),
      [1, 2]
    )
    assert.equal(view.count('initializeApplication'), 0)
  })
  test('provider-guided setup previews and confirms without JSON, and changing model invalidates confirmation', async (t) => {
    const fields = ['first', 'second', 'third'].map((key) => ({
      kind: 'analytics',
      key,
      label: key,
      providerId: 'test.provider',
      requiredNumericFields: []
    }))
    const option = (id) => ({ id, label: id })
    const item = { ...app, status: 'ready', botId: 'original' }
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(item, fields)
      if (method === 'applicationOrganizationSettings')
        return {
          modelSetup: { kind: 'connection-model' },
          settings: { revision: 5, members: {}, queries: {} },
          users: [],
          sources: []
        }
      if (method === 'applicationOrganizationModelSetup') {
        switch (input.operation.step) {
          case 'connections':
            return { choices: [option('connection')] }
          case 'models':
            return { choices: [option('model-a'), option('model-b')] }
          case 'preview':
            return {
              receipt: 'reviewed',
              queries: fields.map((f) => ({
                key: f.key,
                rowCount: 1,
                fields: [{ id: 'actual', label: 'Actual' }],
                sample: [{ actual: '17' }]
              }))
            }
          case 'confirm':
            return { queries: Object.fromEntries(fields.map((f) => [f.key, { id: f.key }])) }
        }
      }
      if (method === 'saveApplicationOrganizationSettings') return { revision: 6 }
      return defaultResult(method, input)
    })
    const select = async (id, value) =>
      React.act(async () => {
        const choice = document.getElementById(id)
        choice.value = value
        choice.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
      })
    await view.click('Apps')
    await view.click('Meetings')
    await view.click('Edit organization settings')
    const submit = () => document.querySelector('form button[type=submit]')
    assert.equal(document.querySelector('form textarea'), null)
    await select('application-connection', 'connection')
    await select('application-model', 'model-a')
    await view.click('Preview queries')
    assert.equal(document.querySelectorAll('form tbody').length, 3)
    assert.ok(submit().disabled)
    await view.click('Confirm shared analysis definition')
    assert.ok(!submit().disabled)
    await select('application-model', 'model-b')
    assert.ok(submit().disabled)
    assert.equal(document.querySelectorAll('form tbody').length, 0)
    await view.click('Preview queries')
    await view.click('Confirm shared analysis definition')
    await view.click('Save organization settings')
    const write = view.calls.find((c) => c.method === 'saveApplicationOrganizationSettings')
    assert.equal(write.input.organizationSettings.revision, 5)
    assert.equal(view.count('initializeApplication'), 0)
  })
  test('member edits retain the saved model queries and canceling a model change restores them', async (t) => {
    const source = { kind: 'definition', definitionId: 'org-source', versionId: 'v2' }
    const query = {
      id: 'forecast',
      source,
      providerId: 'provider',
      operation: 'read',
      contractVersion: 1,
      payload: { period: 'Q2' },
      parameters: [],
      output: { fields: [{ id: 'n', logicalType: 'decimal' }] }
    }
    const fields = [
      { key: 'forecast', kind: 'analytics', label: 'Forecast', providerId: 'provider', requiredNumericFields: ['n'] },
      { key: 'reviewer', kind: 'members', label: 'Reviewers', optional: true }
    ]
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup({ ...app, status: 'ready', botId: 'existing' }, fields)
      if (method === 'applicationOrganizationSettings')
        return {
          modelSetup: { kind: 'connection-model' },
          settings: { revision: 4, members: {}, queries: { forecast: query } },
          users: [{ id: 'peer', label: 'Peer' }],
          sources: [{ source, name: 'Forecast data', providers: [{ id: 'provider' }] }]
        }
      if (method === 'applicationOrganizationModelSetup') return { choices: [] }
      if (method === 'saveApplicationOrganizationSettings') return { revision: 5 }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    await view.click('Edit organization settings')
    const submit = () => document.querySelector('form button[type=submit]')
    assert.equal(view.count('applicationOrganizationModelSetup'), 0)
    await choose(view, 'reviewer', 'peer')
    assert.ok(!submit().disabled)
    await view.click('Change model')
    assert.ok(submit().disabled)
    const modelCalls = view.count('applicationOrganizationModelSetup')
    assert.ok(modelCalls > 0)
    await view.click('Keep saved queries')
    assert.ok(!submit().disabled)
    await view.click('Save organization settings')
    const saved = view.calls.find((c) => c.method === 'saveApplicationOrganizationSettings').input
    assert.deepEqual(JSON.parse(JSON.stringify(saved.organizationSettings)), {
      revision: 4,
      members: { reviewer: ['peer'] },
      queries: { forecast: query }
    })
    assert.equal(view.count('applicationOrganizationModelSetup'), modelCalls)
    assert.ok(
      view.calls
        .filter((c) => c.method === 'applicationOrganizationModelSetup')
        .every((c) => c.input.operation.step === 'connections')
    )
    assert.equal(view.count('initializeApplication'), 0)
  })
  test('a saved model query cannot be retained after its authorized source version changes', async (t) => {
    const field = { key: 'query', kind: 'analytics', providerId: 'example', label: 'Query', requiredNumericFields: [] }
    const source = { kind: 'definition', definitionId: 'definition', versionId: 'old' }
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup({ ...app, status: 'ready', botId: 'existing' }, [field])
      if (method === 'applicationOrganizationSettings')
        return {
          modelSetup: { kind: 'connection-model' },
          settings: {
            revision: 1,
            members: {},
            queries: { query: { source, providerId: 'example', output: { fields: [] } } }
          },
          users: [],
          sources: [{ name: 'Updated', source: { ...source, versionId: 'new' }, providers: [{ id: 'example' }] }]
        }
      if (method === 'applicationOrganizationModelSetup') return { choices: [] }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    await view.click('Edit organization settings')
    assert.ok(document.getElementById('application-connection'))
    assert.ok(document.querySelector('form button[type=submit]').disabled)
    assert.ok(!document.querySelector('form').textContent.includes('Keep saved queries'))
  })
  test('template provisioning reviews exact recipients and automatically previews the returned model before saving', async (t) => {
    const option = (id) => ({ id, label: id })
    const fields = [
      { kind: 'analytics', key: 'query', label: 'Count', providerId: 'testing.provider', requiredNumericFields: [] }
    ]
    const item = { ...app, status: 'ready', botId: 'existing' }
    let writes = 0
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(item, fields)
      if (method === 'applicationOrganizationSettings')
        return {
          modelSetup: {
            kind: 'connection-model',
            bootstrap: { version: '2', modes: [option('read-only'), option('bound')] }
          },
          users: [option('actor'), option('peer')],
          sources: [],
          settings: { revision: 5, members: {}, queries: {} }
        }
      if (method === 'applicationOrganizationModelSetup') {
        const op = input.operation
        switch (op.step) {
          case 'connections':
            return { choices: [option('connection')] }
          case 'models':
            return { choices: [] }
          case 'bootstrap-workspaces':
            return { choices: [option('private')], actorId: 'actor' }
          case 'bootstrap-sources':
            return { choices: [option('source')] }
          case 'bootstrap-plan':
            return { plan: { state: 'create', modelLabel: 'Template Model', differences: [], receipt: 'receipt' } }
          case 'bootstrap-apply':
            assert.deepEqual([...op.userIds], ['actor', 'peer'])
            assert.equal(op.mode, 'bound')
            assert.equal(op.receipt, 'receipt')
            writes++
            return { model: option('published') }
          case 'preview':
            assert.equal(op.modelId, 'published')
            return {
              queries: [{ key: 'query', rowCount: 1, fields: [{ id: 'n', label: 'Count' }], sample: [{ n: 3 }] }],
              receipt: 'sample'
            }
          case 'confirm':
            return { queries: { query: { id: 'count' } } }
        }
      }
      if (method === 'saveApplicationOrganizationSettings') return { revision: 6 }
      return defaultResult(method, input)
    })
    const select = async (id, value) =>
      React.act(async () => {
        const el = document.getElementById(id)
        el.value = value
        el.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
      })
    await view.click('Apps')
    await view.click('Meetings')
    await view.click('Edit organization settings')
    await select('application-connection', 'connection')
    await view.click('Prepare a model from the application template')
    assert.match(document.querySelector('form').textContent, /Existing read grants are retained/)
    await select('bootstrap-workspace', 'private')
    await select('bootstrap-source', 'source')
    await select('bootstrap-mode', 'read-only')
    await view.click('Review model and access')
    assert.equal(writes, 0)
    await select('bootstrap-mode', 'bound')
    assert.ok(!document.querySelector('form').textContent.includes('Confirm and preview queries'))
    await select('bootstrap-members', 'peer')
    await view.click('Review model and access')
    await view.click('Confirm and preview queries')
    assert.equal(writes, 1)
    assert.equal(document.querySelectorAll('form tbody').length, 1)
    assert.ok(document.querySelector('form button[type=submit]').disabled)
    await view.click('Confirm shared analysis definition')
    await view.click('Save organization settings')
    assert.equal(view.count('saveApplicationOrganizationSettings'), 1)
    assert.equal(view.count('initializeApplication'), 0)
  })
  test('organization without published sources shows the empty state and blocks installation', async (t) => {
    const fields = [
      {
        key: 'analysis',
        kind: 'analytics',
        label: 'Margin analysis',
        providerId: 'data-xpert.ontology',
        requiredNumericFields: ['actual', 'budget']
      }
    ]
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'applicationSetup') return setup(app, fields)
      if (method === 'applicationOrganizationSettings')
        return { settings: { revision: 0, members: {}, queries: {} }, users: [], sources: [] }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    assert.ok(document.querySelector('form').textContent.includes('Open analytics definitions'))
    assert.ok(document.querySelector('form button[type=submit]').disabled)
    assert.ok(document.getElementById('organization-field-analysis').disabled)
    assert.equal(view.count('initializeApplication'), 0)
  })
}
