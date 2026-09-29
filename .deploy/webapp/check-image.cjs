// Verify the deployable Nginx image and both frontend entry points without an API
// or published host port. A SPA fallback must never mask a missing JS/CSS bundle.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { setTimeout } = require('node:timers/promises')

const image = process.argv[2] ?? 'xpert-webapp:health-check'
const name = `xpert-web-health-${randomUUID()}`
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
const fetchPage = (pathname) => docker('exec', name, 'wget', '-qO-', `http://127.0.0.1${pathname}`)

async function main() {
  let started = false
  try {
    docker(
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--network',
      'none',
      '-e',
      'WEBAPP_API_BASE_URL=https://api.example.test',
      image
    )
    started = true
    // The entrypoint substitutes runtime settings in all bundles before Nginx
    // starts. Allow for slower cross-architecture Docker emulation as well.
    const deadline = Date.now() + 120000
    while (true) {
      try {
        fetchPage('/')
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await setTimeout(500)
      }
    }
    docker('exec', name, 'nginx', '-t')
    const checked = new Set()
    for (const [pathname, marker] of [
      ['/', '<xp-root'],
      ['/explore', '<xp-root'],
      ['/chatkit', 'id="root"'],
      ['/chatkit/', 'id="root"']
    ]) {
      const html = fetchPage(pathname).replace(/<!--[\s\S]*?-->/g, '')
      assert.ok(html.includes(marker), `${pathname}: application root missing`)
      const assets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)]
        .map((match) => new URL(match[1], `http://127.0.0.1${pathname}`))
        .filter((url) => url.host === '127.0.0.1' && /\.(css|js)$/.test(url.pathname))
      assert.ok(assets.length, `${pathname}: no bundle assets`)
      for (const url of assets) {
        if (checked.has(url.pathname)) continue
        const body = fetchPage(url.pathname)
        assert.ok(body.trim(), `${url.pathname}: empty asset`)
        assert.doesNotMatch(body.slice(0, 100), /<!doctype html/i, `${url.pathname}: HTML fallback instead of asset`)
        checked.add(url.pathname)
      }
      console.log(`${pathname}: passed`)
    }
    console.log(`Nginx startup and ${checked.size} JavaScript/CSS assets passed`)
  } finally {
    if (started) docker('rm', '-f', name)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
