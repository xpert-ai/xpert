// One identity per build is compiled into Cloud and its entry page.
// ChatKit stays on the installed release without opting into standalone updates.
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { injectChatkitIconStylesheet } = require('./prepare-chatkit-entry.cjs')

function stampRelease(html, metadata) {
  return html
    .replace(/<meta\b[^>]*\bname=(["'])xpert-web-(?:build|version)\1[^>]*>/gi, '')
    .replace('</head>', `${metadata}</head>`)
}

function prepareWebRelease(root, buildId = randomUUID()) {
  const destination = path.join(root, '.cache/web-release')
  const version = JSON.parse(fs.readFileSync(path.join(root, 'apps/cloud/package.json'), 'utf8')).version
  const release = { buildId, version }
  const metadata = `<meta name="xpert-web-build" content="${buildId}"><meta name="xpert-web-version" content="${version}">`
  fs.mkdirSync(destination, { recursive: true })
  const stagedChatkit = path.join(destination, 'chatkit')
  fs.rmSync(stagedChatkit, { recursive: true, force: true })
  fs.cpSync(path.join(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app'), stagedChatkit, { recursive: true })
  fs.writeFileSync(path.join(destination, 'version.json'), JSON.stringify(release))
  fs.writeFileSync(
    path.join(destination, 'version.ts'),
    `export const WEB_RELEASE = ${JSON.stringify(release)} as const\n`
  )
  const cloud = fs.readFileSync(path.join(root, 'apps/cloud/src/index.html'), 'utf8')
  fs.writeFileSync(path.join(destination, 'index.html'), stampRelease(cloud, metadata))
  const chatkit = fs
    .readFileSync(path.join(stagedChatkit, 'index.html'), 'utf8')
    .replaceAll('"/assets/', '"/chatkit/assets/')
  fs.writeFileSync(path.join(stagedChatkit, 'index.html'), stampRelease(injectChatkitIconStylesheet(chatkit), ''))
  fs.copyFileSync(path.join(root, '.deploy/webapp/retire-service-worker.js'), path.join(destination, 'ngsw-worker.js'))
  return release
}

if (require.main === module) prepareWebRelease(path.resolve(__dirname, '../..'))
module.exports = { prepareWebRelease }
