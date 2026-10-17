const assert = require('node:assert/strict')

/** Exercise real origin rules; localhost alone would not cover HTTP intranet deployments. */
module.exports = async function verifyDependencyEnvironments(browser, bundle, dependency) {
  const passed = []
  for (const protocol of ['https', 'http']) {
    const page = await browser.newPage()
    try {
      await page.route('**/*', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html><head></head><body><iframe></iframe></body></html>'
        })
      )
      await page.goto(`${protocol}://artifact-dependencies.test/`)
      assert.deepEqual(
        await page.evaluate(() => ({
          secure: isSecureContext,
          subtle: typeof crypto.subtle !== 'undefined'
        })),
        { secure: protocol === 'https', subtle: protocol === 'https' }
      )
      await page.addScriptTag({ content: bundle })
      await page.evaluate(async (dependency) => {
        const { source, ...lock } = dependency
        const verified = DocumentHost.verifyArtifactDocumentDependencies([dependency], [lock])
        if (crypto.subtle) {
          const native = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
          const hex = Array.from(new Uint8Array(native), (byte) => byte.toString(16).padStart(2, '0')).join('')
          if (verified[0].sha256 !== hex) throw Error('NATIVE_DIGEST_MISMATCH')
        }
        const rejects = (input) => {
          try {
            DocumentHost.verifyArtifactDocumentDependencies(input, [lock])
          } catch (error) {
            return error.message
          }
          throw Error('UNVERIFIED_DEPENDENCY_ACCEPTED')
        }
        if (rejects([{ ...dependency, source: source + ' ' }]) !== 'DOCUMENT_DEPENDENCY_INTEGRITY_FAILED')
          throw Error('TAMPERING_NOT_REJECTED')
        if (rejects([{ ...dependency, version: '9.9.9' }]) !== 'DOCUMENT_DEPENDENCY_LOCK_MISMATCH')
          throw Error('WRONG_VERSION_ACCEPTED')
        DocumentHost.installArtifactDocumentFramePolicy(document)
        window.host = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
          dependencies: verified,
          html: '<html><body><output></output><script>window.xpertLiveArtifact.subscribe("sales",d=>document.querySelector("output").textContent=d.value);</script></body></html>',
          context: { bindingIds: ['sales'], defaults: {}, theme: 'light', locale: 'en' },
          query: async () => ({ value: 'loaded' })
        })
      }, dependency)
      const frame = page.frames()[1]
      await frame.waitForFunction(() => window.ExampleLibrary && window.xpertLiveArtifact)
      assert.equal(await frame.evaluate(() => window.ExampleLibrary.version), dependency.version)
      await frame.evaluate(() => window.xpertLiveArtifact.query('sales', {}))
      assert.equal(await frame.locator('output').textContent(), 'loaded')
      // The hashing module also works inside an opaque sandbox without any Crypto global.
      await frame.addScriptTag({ content: bundle })
      assert.equal(
        await frame.evaluate((dependency) => {
          Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
          return DocumentHost.verifyArtifactDocumentDependencies([dependency])[0].sha256
        }, dependency),
        dependency.sha256
      )
      await page.evaluate(() => window.host.dispose())
      passed.push(`${protocol} dependency integrity, version lock and mount`, `${protocol} opaque frame without Crypto`)
    } finally {
      await page.close()
    }
  }
  return passed
}
