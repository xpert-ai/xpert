// Run from the platform workspace: node packages/plugin-sdk/tests/artifact-document-browser.cjs
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { build } = require('esbuild')
const { chromium } = require('playwright')
const { createServer } = require('node:http')
const { createHash } = require('node:crypto')
const verifyHostBoundaries = require('./artifact-document-host.cjs')
const verifyDependencyEnvironments = require('./artifact-document-dependencies.cjs')
const verifyNetworkPolicy = require('./artifact-document-network.cjs')

async function main() {
  const bundle = await build({
    entryPoints: [resolve(__dirname, '../src/artifact-document.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'DocumentHost',
    metafile: true,
    write: false,
    tsconfig: resolve(__dirname, '../tsconfig.json')
  })
  assert.ok(
    !Object.keys(bundle.metafile.inputs).some((path) => path.includes('@noble/hashes')),
    'Artifact browser bundle must not depend on @noble/hashes'
  )
  const browser = await chromium.launch({ headless: true })
  let hits = 0
  const trap = createServer((_request, response) => {
    hits++
    response.end('unexpected external request')
  })
  await new Promise((resolve) => trap.listen(0, '127.0.0.1', resolve))
  const destination = `http://127.0.0.1:${trap.address().port}`
  try {
    const page = await browser.newPage()
    const network = []
    page.on('request', (request) => network.push(request.url()))
    await page.setContent('<html><head></head><body><iframe id="document"></iframe></body></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const source = 'window.ExampleLibrary={version:"1.2.3",text:"</script><script>throw Error(123)</script>中文"};'
    const dependency = {
      id: 'example',
      version: '1.2.3',
      global: 'ExampleLibrary',
      format: 'classic-script',
      source,
      sha256: createHash('sha256').update(source).digest('hex')
    }
    await page.evaluate((dependency) => {
      window.executions = []
      window.errors = []
      window.results = []
      DocumentHost.installArtifactDocumentFramePolicy(document)
      window.host = DocumentHost.mountArtifactDocument(document.querySelector('iframe'), {
        dependencies: [dependency],
        html: '<html><body><select id="region"></select><output id="result"></output><script>try{eval("1+1");window.evalBlocked=false}catch{window.evalBlocked=true}window.addEventListener("message",e=>{if(e.ports[0])window.testPort=e.ports[0]});window.xpertLiveArtifact.bindSelect(document.querySelector("select"),{bindingId:"sales",controlId:"region",fieldId:"region"});window.xpertLiveArtifact.subscribe("sales",d=>document.querySelector("output").textContent=d.rows[0].value);</script></body></html>',
        context: { bindingIds: ['sales'], defaults: { region: null }, theme: 'light', locale: 'en' },
        query: async (input) => {
          window.executions.push(input)
          if (input.controls.region === 'slow') await new Promise((r) => setTimeout(r, 150))
          return {
            rows: ['east', 'west']
              .filter((region) => !['east', 'west'].includes(input.controls.region) || region === input.controls.region)
              .map((region) => ({ region, value: input.controls.region || 'all' })),
            executionId: window.executions.length
          }
        },
        onError: (code) => window.errors.push(code),
        onResult: (value) => window.results.push(value)
      })
    }, dependency)
    const frame = page.frames()[1]
    await frame.waitForFunction(() => window.testPort)
    assert.deepEqual(await frame.evaluate(() => window.ExampleLibrary), {
      version: '1.2.3',
      text: '</script><script>throw Error(123)</script>中文'
    })
    await frame.evaluate(() => window.xpertLiveArtifact.query('sales', { region: null }))
    assert.equal(await frame.locator('output').textContent(), 'all')
    await page.evaluate(() => window.host.refresh())
    await page.waitForFunction(() => window.executions.length === 2)
    assert.equal(await frame.locator('output').textContent(), 'all')
    const isolation = await frame.evaluate(async (destination) => {
      const denied = async (fn) => {
        try {
          await fn()
          return false
        } catch {
          return true
        }
      }
      return {
        undeclared: await denied(() => window.xpertLiveArtifact.query('secret', {})),
        parentDom: await denied(() => parent.document.body),
        storage: await denied(() => localStorage.getItem('token')),
        fetch: await denied(() => fetch(destination + '/secret')),
        eval: window.evalBlocked
      }
    }, destination)
    assert.deepEqual(isolation, { undeclared: true, parentDom: true, storage: true, fetch: true, eval: true })
    await frame.evaluate(() => {
      window.testPort.postMessage({
        type: 'query',
        requestId: 'injected',
        bindingId: 'sales',
        controls: {},
        payload: { sql: 'SELECT secret' }
      })
      window.testPort.postMessage({ type: 'query', requestId: 'foreign', bindingId: 'secret', controls: {} })
      parent.postMessage(
        {
          channel: 'xpertai.remote_component',
          protocolVersion: 1,
          type: 'executeAction',
          actionKey: 'save',
          input: {}
        },
        '*'
      )
    })
    await page.waitForFunction(() => window.errors.length >= 3)
    assert.deepEqual(await page.evaluate(() => window.errors), [
      'DOCUMENT_BINDING_DENIED',
      'DOCUMENT_INVALID_REQUEST',
      'DOCUMENT_BINDING_DENIED'
    ])
    assert.equal(await page.evaluate(() => window.executions.length), 2)
    await frame.locator('select').selectOption({ label: 'west' })
    await page.waitForFunction(() => window.executions.length === 3)
    await frame.waitForFunction(() => document.querySelector('output').textContent === 'west')
    assert.deepEqual(await frame.locator('option').allTextContents(), ['All', 'east', 'west'])
    await page.evaluate(() => window.host.refresh())
    await page.waitForFunction(() => window.executions.length === 4)
    assert.equal(await page.evaluate(() => window.executions.at(-1).controls.region), 'west')
    assert.equal(await frame.locator('select').inputValue(), JSON.stringify('west'))

    const race = await frame.evaluate(async () => {
      const slow = window.xpertLiveArtifact.query('sales', { region: 'slow' }).catch((e) => e.code)
      await window.xpertLiveArtifact.query('sales', { region: 'east' })
      return slow
    })
    assert.equal(race, 'DOCUMENT_QUERY_SUPERSEDED')
    assert.equal(await frame.locator('output').textContent(), 'east')
    assert.equal(await page.evaluate(() => window.results.at(-1).rows[0].value), 'east')
    await frame.evaluate((destination) => {
      const img = new Image()
      img.src = destination + '/image'
      document.body.append(img)
      const script = document.createElement('script')
      script.src = destination + '/script'
      document.head.append(script)
      const iframe = document.createElement('iframe')
      iframe.src = destination + '/frame'
      document.body.append(iframe)
      location.href = destination + '/navigation'
    }, destination)
    await page.waitForTimeout(200)
    assert.equal(hits, 0, 'No request reached the listening HTTP server; CDP can still report CSP-blocked requests')
    await page.evaluate(() => window.host.dispose())
    const hostChecks = await verifyHostBoundaries(browser, bundle.outputFiles[0].text)
    const dependencyChecks = await verifyDependencyEnvironments(browser, bundle.outputFiles[0].text, dependency)
    const networkChecks = await verifyNetworkPolicy(browser, bundle.outputFiles[0].text)
    console.log(
      JSON.stringify({
        passed: [
          'exact dependency bytes without script termination',
          'query',
          'refresh retains controls',
          'select options and filtered preservation',
          'undeclared binding',
          'payload injection',
          'unrelated bridge message',
          'parent DOM isolation',
          'storage isolation',
          'fetch/CSP',
          'eval/CSP',
          'latest result wins',
          'external resources',
          'self navigation',
          ...dependencyChecks,
          ...networkChecks,
          ...hostChecks
        ]
      })
    )
  } finally {
    await browser.close()
    await new Promise((resolve) => trap.close(resolve))
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
