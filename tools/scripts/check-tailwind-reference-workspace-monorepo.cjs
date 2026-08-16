const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const referenceTarget = path.join(repoRoot, 'tailwind-workspace-reference.css')
const roots = ['libs', 'packages', 'legacies'].map((dir) => path.join(repoRoot, dir))
const globalChainReferenceOverride = '@reference "../../../tailwind-workspace-reference.css";'
const globalChainReferenceFiles = new Set([
  'libs/formly/_formly-theme.scss',
  'libs/formly/_formly.scss',
  'libs/formly/table/_table-theme.scss',
  'packages/ui/src/lib/ui/compat/common/input/_input.component.scss',
  'packages/ui/src/lib/ui/compat/common/select/_select.component.scss',
  'packages/ui/src/lib/ui/compat/common/table/_table-theme.scss',
  'packages/ui/src/lib/ui/compat/common/tree-select/_tree-select-theme.scss',
  'packages/ui/src/lib/ui/compat/core/directives/_appearance.scss',
  'packages/ui/src/lib/ui/compat/core/directives/_appearance-theme.scss',
  'packages/ui/src/lib/ui/compat/core/style/card.scss',
  'packages/ui/src/lib/ui/compat/core/style/cdk-dialog.scss',
  'packages/ui/src/lib/ui/compat/core/style/common.scss',
  'packages/ui/src/lib/ui/compat/core/style/input.scss',
  'packages/ui/src/lib/ui/compat/core/style/list.scss',
  'packages/ui/src/lib/ui/compat/core/style/menu.scss',
  'packages/ui/src/lib/ui/compat/core/style/z-radio-group.scss'
])

function walkScss(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc

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

const files = roots.flatMap((root) => walkScss(root))
const errors = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const relativeFile = toPosixPath(path.relative(repoRoot, file))

  if (/^\s*@config\s+"[^"]*tailwind(\.workspace)?\.config\.js";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden @config for tailwind config`)
  }

  if (/^\s*@reference\s+"tailwindcss";\s*$/m.test(content)) {
    errors.push(`${file}: forbidden @reference "tailwindcss"`)
  }

  if (!/@apply\b/.test(content)) continue

  if (globalChainReferenceFiles.has(relativeFile)) {
    if (!content.includes(globalChainReferenceOverride)) {
      errors.push(`${file}: missing expected override reference ${globalChainReferenceOverride}`)
    }
    continue
  }

  const expectedRelPath = toPosixPath(path.relative(path.dirname(file), referenceTarget))
  const expectedReference = `@reference "${expectedRelPath}";`
  if (!content.includes(expectedReference)) {
    errors.push(`${file}: missing expected reference ${expectedReference}`)
  }
}

if (errors.length > 0) {
  console.error('Workspace monorepo Tailwind reference check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Workspace monorepo Tailwind reference check passed. files=${files.length}`)
