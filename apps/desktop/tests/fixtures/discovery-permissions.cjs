const { test } = require('node:test')
const assert = require('node:assert/strict')
const { library, defaultResult } = require('./discovery-catalog.cjs')

module.exports = (mountCatalog) => {
  test('organization installation and shared workspace management grant independent discovery access', async (t) => {
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'organizationPluginAccess') return false
      if (method === 'workspaceConnectors') return []
      return defaultResult(method, input)
    })
    const tabs = () => Array.from(document.querySelectorAll('[role="tab"]'), (tab) => tab.textContent)
    assert.ok(!tabs().includes('Plugins'))
    await view.render('organization-one', null)
    await view.click('Connectors')
    assert.match(document.body.textContent, /Select a workspace to configure/)
    assert.deepEqual(
      Array.from(document.querySelector('[aria-label="Select a workspace you manage"]').options, (o) => o.value),
      ['one']
    )
    await view.render('organization-one', library.workspaces[1])
    assert.match(document.body.textContent, /Workspace management permission is required/)
    assert.equal(view.count('workspaceConnectors'), 0)
    await view.render('organization-one', library.workspaces[0])
    assert.match(document.body.textContent, /No connectors available/)
    assert.equal(view.count('pluginLibrary'), 0)
    assert.ok(view.count('workspaceConnectors') > 0)
  })

  test('an administrator can install a Git package into the organization in the all-assistants view', async (t) => {
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'installOrganizationPlugin') return { name: 'Demo', existing: false }
      return defaultResult(method, input)
    })
    await view.render('organization-one', null)
    await view.click('Plugins')
    await view.click('Install plugin')
    await view.click('Install from Git repository…')
    document.querySelector('input[name="url"]').value = 'https://example.com/plugins.git'
    await view.click('Install in {{organization}}')
    const install = view.calls.find((call) => call.method === 'installOrganizationPlugin')
    assert.deepEqual(
      { ...install.input },
      { organizationId: 'organization-one', url: 'https://example.com/plugins.git', ref: 'HEAD', subdirectory: '.' }
    )
    assert.equal(view.count('pluginLibrary'), 2)
  })

  test('choosing a ZIP previews the filename and waits for explicit organization confirmation', async (t) => {
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'installOrganizationPluginZip') return { name: 'Review', existing: true }
      return defaultResult(method, input)
    })
    await view.render('organization-one', null)
    await view.click('Plugins')
    const pick = async (name) => {
      const input = document.querySelector('input[type="file"]')
      const file = new view.dom.window.File(['test-archive'], name)
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await require('react').act(async () =>
        input.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
      )
    }
    await pick('review.txt')
    assert.match(document.querySelector('[role="alert"]').textContent, /non-empty ZIP/)
    await pick('review.ZIP')
    assert.match(document.body.textContent, /review.ZIP/)
    assert.equal(view.count('installOrganizationPluginZip'), 0)
    await view.click('Cancel')
    assert.doesNotMatch(document.body.textContent, /review.ZIP/)
    await pick('review.ZIP')
    await view.click('Install in {{organization}}')
    const upload = view.calls.find((entry) => entry.method === 'installOrganizationPluginZip')
    assert.equal(upload.input.organizationId, 'organization-one')
    assert.equal(upload.input.file.name, 'review.ZIP')
    assert.equal(view.count('pluginLibrary'), 2)
  })

  test('returning to Bosi preserves plugin details and connector cards without catalog reads', async (t) => {
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'workspaceConnectors')
        return [
          {
            provider: 'test',
            name: 'Example connector',
            available: true,
            hasWebMethods: true,
            status: 'disconnected',
            keyMethods: []
          }
        ]
      if (method === 'skillCatalog') return { items: [], total: 0 }
      return defaultResult(method, input)
    })
    await view.click('Plugins')
    await view.click('Meeting tools')
    const title = document.querySelector('h3')
    const permissionReads = view.count('organizationPluginAccess')
    for (let i = 0; i < 3; i++) await view.activate()
    assert.equal(view.count('pluginLibrary'), 1)
    assert.equal(title.isConnected, true)
    await view.click('Connectors')
    const initial = view.count('workspaceConnectors')
    const card = document.querySelector('[role="tabpanel"]:not([hidden]) article')
    for (let i = 0; i < 3; i++) await view.activate()
    assert.equal(view.count('workspaceConnectors'), initial)
    assert.equal(view.count('organizationPluginAccess'), permissionReads)
    assert.equal(card.isConnected, true)
    await view.click('Refresh catalog')
    assert.equal(view.count('workspaceConnectors'), initial + 1)
    await view.click('Skills')
    await view.activate()
    assert.equal(view.count('pluginLibrary'), 1, 'refreshing other tabs must not reload the hidden plugin inventory')
    await view.click('Plugins')
    assert.equal(title.isConnected, true)
    await view.click('Refresh catalog')
    assert.equal(view.count('pluginLibrary'), 2)
  })

  test('manager configures the selected provider, returns to updated status and confirms shared disconnect', async (t) => {
    let connected = false
    const view = await mountCatalog(t, (method, input) => {
      if (method === 'organizationPluginAccess') return false
      if (method === 'workspaceConnectors')
        return [
          {
            provider: 'github',
            name: 'GitHub',
            available: true,
            hasWebMethods: true,
            status: connected ? 'active' : 'disconnected',
            bindingId: connected ? 'binding-one' : null,
            keyMethods: [
              {
                id: 'pat',
                label: 'Token',
                fields: [{ name: 'token', label: 'Access token', required: true, secret: true, initial: '' }]
              }
            ]
          }
        ]
      if (method === 'connectWorkspaceApiKey') {
        connected = true
        return { connected }
      }
      if (method === 'disconnectWorkspaceConnector') {
        connected = false
        return
      }
      return defaultResult(method, input)
    })
    const targets = []
    await view.click('Connectors')
    await view.click('Configure connector')
    const field = document.querySelector('input[type="password"]')
    field.value = 'fixture-only'
    const initial = view.count('workspaceConnectors')
    await view.activate()
    assert.equal(view.count('workspaceConnectors'), initial)
    view.dom.window.xpertDesktop.openPlatform = async () => false
    await view.click('Configure in Xpert')
    await view.activate()
    assert.equal(view.count('workspaceConnectors'), initial, 'failed launches must not arm a refresh')
    view.dom.window.xpertDesktop.openPlatform = async (payload) => {
      targets.push({ ...payload })
      return true
    }
    await view.click('Configure in Xpert')
    assert.deepEqual(targets, [
      {
        target: 'workspace.connectors.manage',
        organizationId: 'organization-one',
        workspaceId: 'one',
        provider: 'github'
      }
    ])
    await view.activate()
    await view.activate()
    assert.equal(view.count('workspaceConnectors'), initial + 1, 'returning from the external setup refreshes once')
    assert.equal(document.querySelector('input[type="password"]'), field)
    assert.equal(field.value, 'fixture-only')
    await view.click('Save connection')
    assert.equal(connected, true)
    const saved = view.calls.find((call) => call.method === 'connectWorkspaceApiKey').input
    assert.deepEqual(JSON.parse(JSON.stringify(saved)), {
      organizationId: 'organization-one',
      workspaceId: 'one',
      provider: 'github',
      methodId: 'pat',
      values: { token: 'fixture-only' }
    })
    await view.click('Configure connector')
    await view.click('Disconnect')
    assert.equal(view.count('disconnectWorkspaceConnector'), 0)
    await view.click('Disconnect')
    assert.equal(connected, false)
    assert.deepEqual(
      { ...view.calls.find((call) => call.method === 'disconnectWorkspaceConnector').input },
      { organizationId: 'organization-one', workspaceId: 'one', bindingId: 'binding-one' }
    )
  })
}
