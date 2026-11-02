// Font IconDefinitions in stored tool events need the same local icon assets as Cloud.
// Keep the installed ChatKit entry's hashed bundles intact; never patch dependency files.
const fs = require('node:fs')
const path = require('node:path')

function injectChatkitIconStylesheet(html) {
  if (!html.includes('</head>')) throw new Error('ChatKit entry is missing its head element')
  const stylesheet = '/assets/chatkit-icons/remixicon.css'
  return html.includes(`href="${stylesheet}"`)
    ? html
    : html.replace('</head>', `  <link rel="stylesheet" href="${stylesheet}">\n  </head>`)
}

function prepareChatkitEntry({ root = path.resolve(__dirname, '../..'), source } = {}) {
  const entry = source || path.join(root, 'node_modules/@xpert-ai/chatkit-ui/dist/app/index.html')
  const output = injectChatkitIconStylesheet(fs.readFileSync(entry, 'utf8'))
  const destination = path.join(root, '.cache/chatkit-entry')
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'index.html'), output)
  return destination
}

if (require.main === module) console.log(`ChatKit entry prepared: ${prepareChatkitEntry()}`)
module.exports = { prepareChatkitEntry, injectChatkitIconStylesheet }
