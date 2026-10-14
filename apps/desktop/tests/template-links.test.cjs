const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseTemplateLink, createTemplateLinks } = require('../electron/template-links.cjs')
const web = 'http://localhost:4300'
const link = `xpert://template/import?origin=${encodeURIComponent(web)}&id=shared-example`
test('template links accept only the configured platform and the exact credential-free route', () => {
  assert.deepEqual(parseTemplateLink(link, web), { id: 'shared-example', origin: web })
  for (const value of [
    link.replace('import', 'delete'),
    link + '&token=secret',
    link + '&id=other',
    link + '#fragment',
    link.replace('localhost', 'attacker.example'),
    'javascript:alert(1)',
    'xpert://template/import?origin=http://user:secret@localhost:4300&id=a'
  ])
    assert.equal(parseTemplateLink(value, web), null)
})
test('cold start and sign-in continuation persist only a validated template link', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-links-'))
  let service = { config: { webUrl: web }, profile: null },
    notified = 0
  try {
    const options = { directory, getService: () => service, notify: () => notified++ }
    const first = createTemplateLinks(options)
    assert.equal(first.receive(link), true)
    assert.equal(notified, 1)
    assert.equal(first.read(), null)
    service.profile = { organizationId: 'chosen' }
    const restarted = createTemplateLinks(options)
    assert.equal(restarted.read().id, 'shared-example')
    assert.equal(restarted.dismiss('other'), false)
    assert.equal(restarted.dismiss('shared-example'), true)
    assert.equal(restarted.read(), null)
    assert.equal(first.receive(link.replace('4300', '4301')), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
test('changing the configured platform does not replay a pending link on another server', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-links-'))
  const service = { config: { webUrl: web }, profile: { organizationId: 'chosen' } }
  try {
    const links = createTemplateLinks({ directory, getService: () => service, notify() {} })
    links.receive(link)
    service.config.webUrl = 'https://different.example'
    assert.equal(links.read(), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
