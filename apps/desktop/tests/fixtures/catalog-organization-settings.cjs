const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { app, defaultResult } = require('./discovery-catalog.cjs')

module.exports = (mountCatalog) => {
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
          users: [{ id: 'human', label: 'Reviewer' }],
          sources: []
        }
      if (method === 'initializeApplication') return { botId: 'new-assistant' }
      return defaultResult(method, input)
    })
    await view.click('Apps')
    await view.click('Meetings')
    const submit = document.querySelector('form button[type=submit]')
    assert.ok(submit.disabled)
    await React.act(async () => document.querySelector('details input').click())
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
    const select = document.getElementById('organization-field-review')
    await React.act(async () => {
      select.value = select.options[1].value
      select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
    })
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
    await React.act(async () => document.querySelector('details input').click())
    await view.click('Save organization settings')
    assert.match(document.querySelector('[role=alert]').textContent, /Refresh/)
    assert.ok(document.querySelector('details input').checked)
    await view.click('Refresh settings')
    assert.ok(submit().disabled)
    await React.act(async () => document.querySelector('details input').click())
    await view.click('Save organization settings')
    assert.deepEqual(
      view.calls
        .filter((c) => c.method === 'saveApplicationOrganizationSettings')
        .map((c) => c.input.organizationSettings.revision),
      [1, 2]
    )
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
    assert.ok(
      document
        .querySelector('form')
        .textContent.includes('Publish an analytics definition shared with this organization')
    )
    assert.ok(document.querySelector('form button[type=submit]').disabled)
    assert.equal(view.count('initializeApplication'), 0)
  })
}
