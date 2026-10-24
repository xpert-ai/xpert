const assert = require('node:assert/strict')

module.exports = async function verifyNetworkPolicy(browser, bundle) {
  const page = await browser.newPage()
  const hits = []
  try {
    await page.route('https://allowed.example.test/**', async (route) => {
      hits.push(route.request().url())
      const css = route.request().resourceType() === 'stylesheet'
      await route.fulfill({
        contentType: css ? 'text/css' : 'application/javascript',
        body: css ? '#styled { display: grid; padding: 24px; }' : 'window.libraryLoaded=true;'
      })
    })
    await page.route('https://denied.example.test/**', async (route) => {
      hits.push(route.request().url())
      await route.fulfill({ contentType: 'application/javascript', body: 'window.deniedLoaded=true;' })
    })
    await page.setContent('<html><head></head><body><iframe></iframe></body></html>')
    await page.addScriptTag({ content: bundle })
    await page.evaluate(() => {
      DocumentHost.installArtifactDocumentFramePolicy(document)
      window.host = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
        networkPolicy: { scripts: ['https://allowed.example.test'], styles: ['https://allowed.example.test'] },
        context: { bindingIds: ['sales'], defaults: {}, locale: 'en', theme: 'light' },
        query: async () => ({ rows: [{ value: '120' }] }),
        html: `<html><head><script src="https://allowed.example.test/library.js"></script>
          <link rel="stylesheet" href="https://allowed.example.test/style.css">
          <script src="https://denied.example.test/library.js"></script></head><body><div id="styled">Online</div>
          <script>window.fetchBlocked=fetch('https://allowed.example.test/data').then(()=>false,()=>true);
          try { eval('1+1'); window.evalBlocked=false } catch { window.evalBlocked=true }
          window.xpertLiveArtifact.subscribe('sales',d=>document.querySelector('#styled').textContent=d.rows[0].value);
          window.xpertLiveArtifact.query('sales',{});</script></body></html>`
      })
    })
    const frame = page.frames()[1]
    await frame
      .waitForFunction(
        () =>
          window.libraryLoaded &&
          document.querySelector('#styled')?.textContent === '120' &&
          getComputedStyle(document.querySelector('#styled')).padding === '24px',
        null,
        { timeout: 10000 }
      )
      .catch(async (error) => {
        console.error({
          hits,
          body: await frame.locator('body').innerHTML(),
          csp: await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
        })
        throw error
      })
    assert.deepEqual(
      await frame.evaluate(async () => ({
        loaded: window.libraryLoaded,
        denied: !!window.deniedLoaded,
        fetchBlocked: await window.fetchBlocked,
        evalBlocked: window.evalBlocked,
        display: getComputedStyle(document.querySelector('#styled')).display
      })),
      { loaded: true, denied: false, fetchBlocked: true, evalBlocked: true, display: 'grid' }
    )
    assert.deepEqual(hits.sort(), ['https://allowed.example.test/library.js', 'https://allowed.example.test/style.css'])
    await page.evaluate(() => window.host.dispose())
    return [
      'allowed online scripts and styles',
      'denied origins remain blocked',
      'online mode keeps fetch and eval blocked',
      'query bridge with online resources'
    ]
  } finally {
    await page.close()
  }
}
