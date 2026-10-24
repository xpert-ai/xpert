const assert = require('node:assert/strict')

// Runs in a real browser: frame WindowProxy reuse and MessagePort delivery cannot be proven by DOM mocks.
module.exports = async function verifyHostBoundaries(browser, bundle) {
  const page = await browser.newPage()
  const html =
    '<html><body><script>window.initCount=0;window.addEventListener("message",e=>{if(e.ports[0]){window.testPort=e.ports[0];window.initCount++}})</script></body></html>'
  try {
    await page.setContent(
      '<html><head></head><body><iframe id="target"></iframe><iframe id="other"></iframe></body></html>'
    )
    await page.addScriptTag({ content: bundle })
    const missingPolicy = await page.evaluate((html) => {
      try {
        DocumentHost.mountArtifactDocument(document.querySelector('#target'), {
          html,
          context: { bindingIds: ['sales'], defaults: {}, theme: 'light', locale: 'en' },
          query: async () => ({ rows: [] })
        })
        return false
      } catch {
        return true
      }
    }, html)
    assert.equal(missingPolicy, true)
    await page.evaluate((html) => {
      window.blockReady = true
      window.readyMessage = null
      window.addEventListener('message', (event) => {
        if (event.data?.channel === 'xpert.artifact-document' && event.data.type === 'ready') {
          window.readyMessage = event.data
          if (window.blockReady) event.stopImmediatePropagation()
        }
      })
      window.executions = []
      window.errors = []
      window.results = []
      window.busy = []
      window.releases = []
      window.autoResolve = false
      DocumentHost.installArtifactDocumentFramePolicy(document)
      const context = { bindingIds: ['sales'], defaults: { region: null }, theme: 'light', locale: 'en' }
      window.host = DocumentHost.mountArtifactDocument(document.querySelector('#target'), {
        html,
        context,
        query: async (input) => {
          window.executions.push(input)
          if (!window.autoResolve) await new Promise((resolve) => window.releases.push(resolve))
          return { rows: [], requestId: input.requestId }
        },
        onError: (code) => {
          window.errors.push(code)
          throw Error('broken observer')
        },
        onResult: (data) => {
          window.results.push(data)
          throw Error('broken observer')
        },
        onBusy: (busy) => {
          window.busy.push(busy)
          throw Error('broken observer')
        }
      })
      context.bindingIds.push('secret')
      context.defaults.region = 'changed after mount'
    }, html)
    await page.waitForFunction(() => window.readyMessage)
    const originalReady = await page.evaluate(() => {
      window.blockReady = false
      return window.readyMessage
    })
    const frame =
      page.frames().find((frame) => frame !== page.mainFrame() && frame.name() === 'target') || page.frames()[1]
    const other = page.frames()[2]
    await other.evaluate((data) => parent.postMessage(data, '*'), originalReady)
    await frame.evaluate((data) => parent.postMessage(data, '*'), { ...originalReady, sessionId: '0'.repeat(32) })
    await page.waitForTimeout(30)
    assert.equal(
      await frame.evaluate(() => window.initCount),
      0,
      'Other frames and stale nonces cannot receive a query port'
    )
    await frame.evaluate((data) => parent.postMessage(data, '*'), originalReady)
    await frame.waitForFunction(() => window.testPort)
    assert.deepEqual(await frame.evaluate(() => window.xpertLiveArtifact.ready()), {
      bindingIds: ['sales'],
      defaults: { region: null },
      theme: 'light',
      locale: 'en'
    })
    await frame.evaluate((data) => parent.postMessage(data, '*'), originalReady)
    await page.waitForTimeout(30)
    assert.equal(await frame.evaluate(() => window.initCount), 1)

    const send = (requestId, bindingId = 'sales') =>
      frame.evaluate(
        ({ requestId, bindingId }) => {
          window.testPort.postMessage({ type: 'query', requestId, bindingId, controls: {} })
        },
        { requestId, bindingId }
      )
    await send('denied', 'secret')
    await page.waitForFunction(() => window.errors.includes('DOCUMENT_BINDING_DENIED'))
    assert.equal(await page.evaluate(() => window.executions.length), 0)
    await send('active')
    await page.waitForFunction(() => window.executions.length === 1)
    await send('active')
    await page.waitForFunction(() => window.errors.includes('DOCUMENT_REQUEST_REPLAY'))
    await page.evaluate(() => {
      window.testNow = Date.now() + 61000
      Date.now = () => window.testNow
    })
    await send('new-window')
    await page.waitForFunction(() => window.executions.length === 2)
    await send('active')
    await page.waitForFunction(() => window.errors.filter((code) => code === 'DOCUMENT_REQUEST_REPLAY').length === 2)
    assert.equal(
      await page.evaluate(() => window.executions.length),
      2,
      'Window rollover must not permit replay of in-flight requests'
    )
    await page.evaluate(() => window.releases.splice(0).forEach((resolve) => resolve()))
    await page.waitForFunction(() => window.busy.at(-1) === false)

    for (let i = 0; i < 9; i++) await send('concurrent-' + i)
    await page.waitForFunction(() => window.errors.includes('DOCUMENT_QUERY_LIMIT'))
    assert.equal(await page.evaluate(() => window.executions.length), 10)
    await page.evaluate(() => window.releases.splice(0).forEach((resolve) => resolve()))
    await page.waitForFunction(() => window.busy.at(-1) === false)
    await page.evaluate(() => {
      window.testNow += 61000
      window.autoResolve = true
    })
    for (let i = 0; i < 61; i++) await send('rate-' + i)
    await page.waitForFunction(() => window.errors.filter((code) => code === 'DOCUMENT_QUERY_LIMIT').length === 2)
    assert.equal(await page.evaluate(() => window.executions.length), 70)

    await page.evaluate(() => {
      window.testNow += 61000
      window.autoResolve = false
    })
    await send('dispose-pending')
    await page.waitForFunction(() => window.executions.length === 71)
    const resultCount = await page.evaluate(() => window.results.length)
    await page.evaluate(() => {
      window.host.dispose()
      window.host.dispose()
      window.releases.splice(0).forEach((resolve) => resolve())
    })
    await send('after-dispose')
    await page.waitForTimeout(30)
    assert.equal(await page.evaluate(() => window.executions.length), 71)
    assert.equal(await page.evaluate(() => window.results.length), resultCount)
    assert.equal(await page.evaluate(() => window.busy.at(-1)), false)

    await page.evaluate((html) => {
      window.blockReady = true
      window.readyMessage = null
      window.host = DocumentHost.mountArtifactDocument(document.querySelector('#target'), {
        html: html
          .replace('<body>', '<body><select id="typed"></select>')
          .replace(
            '</script>',
            ';window.xpertLiveArtifact.bindSelect(document.querySelector("select"),{bindingId:"other",controlId:"value",fieldId:"value"});</script>'
          ),
        context: { bindingIds: ['other'], defaults: {}, theme: 'dark', locale: 'zh' },
        query: async (input) => {
          window.typedControls = input.controls
          return { rows: [{ value: false }, { value: 0 }, { value: '0' }] }
        }
      })
    }, html)
    await page.waitForFunction(() => window.readyMessage)
    const nextReady = await page.evaluate(() => {
      window.blockReady = false
      return window.readyMessage
    })
    assert.notEqual(nextReady.sessionId, originalReady.sessionId)
    await frame.evaluate((data) => parent.postMessage(data, '*'), originalReady)
    await page.waitForTimeout(30)
    assert.equal(await frame.evaluate(() => window.initCount), 0, 'A previous mount cannot initialize the next mount')
    await frame.evaluate((data) => parent.postMessage(data, '*'), nextReady)
    await frame.waitForFunction(() => window.testPort)
    assert.deepEqual((await frame.evaluate(() => window.xpertLiveArtifact.ready())).bindingIds, ['other'])
    await frame.evaluate(() => window.xpertLiveArtifact.query('other'))
    assert.deepEqual(await frame.locator('option').evaluateAll((options) => options.map((option) => option.value)), [
      'null',
      'false',
      '0',
      '"0"'
    ])
    await frame.locator('select').selectOption('false')
    await page.waitForFunction(() => window.typedControls.value === false)
    await frame.locator('select').selectOption('0')
    await page.waitForFunction(() => window.typedControls.value === 0)
    await frame.locator('select').selectOption('"0"')
    await page.waitForFunction(() => window.typedControls.value === '0')

    await page.evaluate(() => window.host.dispose())
    return [
      'required frame policy',
      'mount-specific handshake',
      'source check',
      'one initialization',
      'context snapshot',
      'in-flight replay across rate windows',
      'concurrency limit',
      'rate limit',
      'observer isolation',
      'dispose drops late results',
      'remount isolation',
      'typed select values'
    ]
  } finally {
    await page.close()
  }
}
