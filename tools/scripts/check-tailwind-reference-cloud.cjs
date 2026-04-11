const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const cloudSrc = path.join(repoRoot, 'apps/cloud/src')
const appRoot = path.join(repoRoot, 'apps/cloud/src/app')
const globalStyles = path.join(repoRoot, 'apps/cloud/src/styles.scss')
const referenceTarget = path.join(repoRoot, 'apps/cloud/src/styles/tailwind-reference.css')
const appTailwindCssReferenceAllowlist = new Set([
  'apps/cloud/src/app/_app.component.scss',
  'apps/cloud/src/app/@shared/_components-theme.scss',
  'apps/cloud/src/app/@shared/_components.scss',
  'apps/cloud/src/app/features/chat/_chat.component.scss',
  'apps/cloud/src/app/features/home/dashboard/_dashboard-theme.scss',
  'apps/cloud/src/app/features/project/_project.component.scss',
  'apps/cloud/src/app/features/semantic-model/_semantic-models.scss',
  'apps/cloud/src/app/features/semantic-model/model/_model-theme.scss',
  'apps/cloud/src/app/features/semantic-model/model/entity/dimension/_dimension.component.scss',
  'apps/cloud/src/app/features/story/_story-theme.scss',
  'apps/cloud/src/app/features/story/toolbar/_toolbar.component.scss'
])

function walkScss(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkScss(full, acc)
    } else if (entry.name.endsWith('.scss')) {
      acc.push(full)
    }
  }

  return acc
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

const allScss = walkScss(cloudSrc)
const appScss = walkScss(appRoot)
const errors = []

for (const file of allScss) {
  if (file === globalStyles) continue

  const content = fs.readFileSync(file, 'utf8')
  if (/^\s*@config\s+"[^"]*tailwind\.config\.js";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden component-level @config for tailwind.config.js`)
  }
}

for (const file of appScss) {
  const content = fs.readFileSync(file, 'utf8')
  const relativeFile = toPosixPath(path.relative(repoRoot, file))
  const isAllowlisted = appTailwindCssReferenceAllowlist.has(relativeFile)

  if (!isAllowlisted && /^\s*@reference\s+"tailwindcss";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden @reference "tailwindcss" in apps/cloud/src/app`)
  }

  if (!/@apply\b/.test(content)) continue

  if (isAllowlisted) continue

  const expectedRelPath = toPosixPath(path.relative(path.dirname(file), referenceTarget))
  const expectedReference = `@reference "${expectedRelPath}";`
  if (!content.includes(expectedReference)) {
    errors.push(`${file}: missing expected reference ${expectedReference}`)
  }
}

if (errors.length > 0) {
  console.error('Cloud Tailwind reference check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Cloud Tailwind reference check passed. allScss=${allScss.length} appScss=${appScss.length}`)
