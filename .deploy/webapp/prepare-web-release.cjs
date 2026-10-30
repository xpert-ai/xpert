// One identity per build is compiled into Cloud and copied into the hosted ChatKit
// entry. Never derive the loaded identity from a request to the latest manifest.
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { injectChatkitIconStylesheet } = require('./prepare-chatkit-entry.cjs')

function stampRelease(html, metadata) {
  return html
    .replace(/<meta\b[^>]*\bname=(["'])xpert-web-(?:build|version)\1[^>]*>/gi, '')
    .replace('</head>', `${metadata}</head>`)
}

function prepareWebRelease(
  root,
  buildId = randomUUID(),
  chatkitSource = path.join(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app')
) {
  const destination = path.join(root, '.cache/web-release')
  const version = JSON.parse(fs.readFileSync(path.join(root, 'apps/cloud/package.json'), 'utf8')).version
  const release = { buildId, version }
  const metadata = `<meta name="xpert-web-build" content="${buildId}"><meta name="xpert-web-version" content="${version}">`
  fs.mkdirSync(destination, { recursive: true })
  const stagedChatkit = path.join(destination, 'chatkit')
  const sourcePath = path.resolve(chatkitSource)
  if (
    sourcePath === stagedChatkit ||
    sourcePath.startsWith(stagedChatkit + path.sep) ||
    stagedChatkit.startsWith(sourcePath + path.sep)
  ) {
    throw new Error('ChatKit source must be separate from generated release staging')
  }
  fs.rmSync(stagedChatkit, { recursive: true, force: true })
  fs.cpSync(chatkitSource, stagedChatkit, { recursive: true })
  const capabilityFile = path.join(stagedChatkit, 'xpert-web-update.json')
  if (!fs.existsSync(capabilityFile)) {
    console.warn(
      'ChatKit package has no standalone web-update support. Use the matching release or CHATKIT_APP_SOURCE for local integration.'
    )
  } else if (JSON.parse(fs.readFileSync(capabilityFile, 'utf8')).schemaVersion !== 1) {
    throw new Error('Unsupported ChatKit web-update capability')
  }
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
  fs.writeFileSync(path.join(stagedChatkit, 'index.html'), stampRelease(injectChatkitIconStylesheet(chatkit), metadata))
  fs.copyFileSync(path.join(root, '.deploy/webapp/retire-service-worker.js'), path.join(destination, 'ngsw-worker.js'))
  return release
}

if (require.main === module) {
  const source = process.env.CHATKIT_APP_SOURCE
  prepareWebRelease(path.resolve(__dirname, '../..'), undefined, source ? path.resolve(source) : undefined)
}
module.exports = { prepareWebRelease }
