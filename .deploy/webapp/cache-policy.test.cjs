// Optional real Nginx checks. These start only isolated, task-owned containers.
// WEB_UPDATE_NGINX_IMAGE must name an already available image; never pull it here.
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { setTimeout } = require('node:timers/promises')
const image = process.env.WEB_UPDATE_NGINX_IMAGE
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })

for (const template of ['nginx.prod.conf', 'nginx.compose.conf']) {
  test(`${template}: entries/manifest bypass cache and missing bundles return 404`, { skip: !image }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-cache-'))
    const name = `xpert-web-cache-${randomUUID()}`
    let started = false
    try {
      for (const [file, content] of Object.entries({
        'index.html': '<html>cloud A</html>',
        'chatkit/index.html': '<html>chatkit A</html>',
        'version.json': '{"buildId":"A","version":"3"}',
        'main-ABC123.js': 'window.loaded="A"',
        'chatkit/assets/index-ABC123.js': 'window.chatkit="A"',
        'styles-ABC123.css': 'body {}',
        'ngsw-worker.js': 'self.addEventListener("install",()=>self.skipWaiting())'
      })) {
        const target = path.join(root, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, content)
      }
      const config = fs
        .readFileSync(path.join(__dirname, template), 'utf8')
        .replace('${API_HOST}', '127.0.0.1')
        .replace('${API_PORT}', '9999')
      fs.writeFileSync(path.join(root, 'nginx.conf'), config)
      docker('image', 'inspect', image)
      docker(
        'run',
        '--rm',
        '-d',
        '--network',
        'none',
        '--name',
        name,
        '-v',
        `${root}:/srv/xpert:ro`,
        '-v',
        `${root}/nginx.conf:/etc/nginx/nginx.conf:ro`,
        image
      )
      started = true
      const request = (url) => {
        const result = spawnSync('docker', ['exec', name, 'curl', '-sS', '-i', `http://127.0.0.1${url}`], {
          encoding: 'utf8',
          timeout: 10000
        })
        assert.equal(result.status, 0, result.stderr || result.stdout)
        const [headers, ...body] = result.stdout.split('\r\n\r\n')
        return { headers, body: body.join('\r\n\r\n') }
      }
      for (let retry = 0; retry < 20; retry++) {
        try {
          if (request('/').headers.includes('200 OK')) break
        } catch (error) {
          if (retry === 19) throw error
        }
        await setTimeout(100)
      }
      docker('exec', name, 'nginx', '-t')
      for (const url of [
        '/',
        '/index.html',
        '/explore/deep',
        '/chatkit',
        '/chatkit/',
        '/chatkit/index.html',
        '/chatkit/thread',
        '/version.json',
        '/ngsw-worker.js'
      ]) {
        const result = request(url)
        assert.match(result.headers, /200 OK/, url)
        assert.match(result.headers, /Cache-Control: no-store/i, url)
      }
      for (const url of ['/s/cs_test', '/artifacts/snapshot/as_test']) {
        const result = request(url)
        assert.match(result.headers, /200 OK/, url)
        assert.match(result.headers, /Cache-Control: no-store/i, url)
        assert.match(result.headers, /X-Robots-Tag: noindex, nofollow, noarchive/i, url)
        assert.match(result.headers, /Referrer-Policy: no-referrer/i, url)
      }
      for (const url of ['/main-ABC123.js', '/chatkit/assets/index-ABC123.js', '/styles-ABC123.css']) {
        const result = request(url)
        assert.match(result.headers, /200 OK/, url)
        assert.match(result.headers, /Cache-Control: no-cache/i, url)
      }
      for (const url of ['/missing.js', '/missing.css', '/chatkit/assets/missing.js', '/ngsw.json']) {
        assert.match(request(url).headers, /404 Not Found/, url)
      }
      if (template === 'nginx.compose.conf') {
        // File endpoints still reach the API, even when a filename ends in JS/CSS.
        // This fixture has no API listener, so proxying must return 502, not static 404.
        for (const url of ['/api/files/document.js', '/public/files/document.css']) {
          assert.match(request(url).headers, /502 Bad Gateway/, url)
        }
      }
    } finally {
      if (started) docker('rm', '-f', name)
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
}
