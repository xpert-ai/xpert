import assert from 'node:assert/strict'
import { DesktopService, DEFAULT_CONFIG } from '../electron/service.cjs'
import { readLocalCredentials } from './local-credentials.mjs'

const service = new DesktopService()
const config = {
  ...DEFAULT_CONFIG,
  apiUrl: process.env.XPERT_API_URL || DEFAULT_CONFIG.apiUrl,
  webUrl: process.env.XPERT_WEB_URL || DEFAULT_CONFIG.webUrl,
  frameUrl: process.env.XPERT_CHATKIT_FRAME_URL || DEFAULT_CONFIG.frameUrl
}
service.configure(config)
try {
  const state = await service.login(readLocalCredentials())
  assert.ok(state.profile)
  assert.ok(state.profile.organizations.length)
  await service.selectOrganization(state.profile.organizations[0].id)
  const bots = await service.listBots()
  assert.ok(bots.length, 'Publish an accessible assistant before running this integration test.')
  for (const bot of bots.slice(0, 2)) {
    const result = await service.chatSession(bot.id)
    assert.ok(result.secret)
    assert.equal(result.organizationId, service.profile.organizationId)
  }
  await service.refresh()
  assert.ok((await service.listBots()).length)
  const catalog = {}
  for (const kind of ['experts', 'applications', 'templates']) {
    const items = await service.listCatalog(kind)
    assert.ok(Array.isArray(items))
    catalog[kind] = items.length
    if (kind === 'applications' && items.length) {
      const setup = await service.applicationSetup(items[0])
      assert.equal(typeof setup.canInitialize, 'boolean')
    }
  }
  assert.ok(Array.isArray(await service.templateWorkspaces()))
  const frame = await fetch(config.frameUrl)
  assert.equal(frame.status, 200)
  const html = await frame.text()
  const script = /<script[^>]+src="([^"]+)"/.exec(html)?.[1]
  assert.ok(script, 'ChatKit must serve its real UI entry point.')
  assert.equal((await fetch(new URL(script, config.frameUrl))).status, 200, 'ChatKit JS assets must be reachable.')
  service.logout()
  assert.equal((await service.state()).profile, null)
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        apiUrl: config.apiUrl,
        frameUrl: config.frameUrl,
        organizations: state.profile.organizations.length,
        accessibleBots: bots.length,
        catalog,
        checks: [
          'login',
          'organization',
          'bot list',
          'two scoped ChatKit sessions',
          'token refresh',
          'three catalog tabs',
          'application preflight',
          'writable template workspaces',
          'ChatKit HTML and JS',
          'logout'
        ]
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local integration failed.')
  process.exitCode = 1
} finally {
  service.logout()
}
