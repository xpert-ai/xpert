const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const workspaceRoot = path.join(repoRoot, 'apps/cloud/src/app/features/xpert/workspace')
const referenceTarget = path.join(repoRoot, 'apps/cloud/src/styles/tailwind-reference.css')
const migratedFiles = [
  'apps/cloud/src/app/features/xpert/workspace/api-tools/tools.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/builtin-tools/tools.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/database/database.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/home/home.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/knowledges/knowledges.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/mcp-tools/tools.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/settings/general/general.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/settings/members/members.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/settings/models/models.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/settings/settings.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/welcome/welcome.component.scss',
  'apps/cloud/src/app/features/xpert/workspace/xperts/xperts.component.scss'
]

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

const files = walkScss(workspaceRoot)
const errors = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')

  if (/^\s*@config\s+"[^"]*tailwind\.config\.js";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden @config for tailwind.config.js`)
  }

  if (/^\s*@reference\s+"tailwindcss";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden @reference "tailwindcss"`)
  }

}

for (const relativeFile of migratedFiles) {
  const fullPath = path.join(repoRoot, relativeFile)

  if (!fs.existsSync(fullPath)) {
    errors.push(`${fullPath}: file does not exist`)
    continue
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  const expectedRelPath = toPosixPath(path.relative(path.dirname(fullPath), referenceTarget))
  const expectedReference = `@reference "${expectedRelPath}";`

  if (!content.includes(expectedReference)) {
    errors.push(`${fullPath}: missing expected reference ${expectedReference}`)
  }
}

if (errors.length > 0) {
  console.error('Workspace Tailwind reference check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Workspace Tailwind reference check passed. files=${files.length} migrated=${migratedFiles.length}`)
