const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const referenceTarget = path.join(repoRoot, 'tailwind-workspace-reference.css')
const roots = ['libs', 'packages', 'legacies'].map((dir) => path.join(repoRoot, dir))
const globalChainReferenceOverride = '@reference "../../../tailwind-workspace-reference.css";'
const globalChainReferenceFiles = new Set([
  'libs/apps/auth/src/lib/_auth-theme.scss',
  'libs/apps/indicator-market/src/lib/_indicator-market-theme.scss',
  'libs/formly/_formly-theme.scss',
  'libs/formly/_formly.scss',
  'libs/formly/mat-table/_table-theme.scss',
  'libs/story-angular/src/lib/explorer/_explorer.component.scss',
  'libs/story-angular/widgets/_widgets-theme.scss',
  'packages/angular/analytical-grid/_analytical-grid.component.scss',
  'packages/angular/common/input/_input.component.scss',
  'packages/angular/common/search/_search.component.scss',
  'packages/angular/common/select/_select.component.scss',
  'packages/angular/common/table/_table-theme.scss',
  'packages/angular/controls/member-list/_member-list-theme.scss',
  'packages/angular/core/directives/_appearance.scss',
  'packages/angular/core/style/_mat-checkbox-theme.scss',
  'packages/angular/core/style/_mat-list-theme.scss',
  'packages/angular/core/style/card.scss',
  'packages/angular/core/style/cdk-dialog.scss',
  'packages/angular/core/style/common.scss',
  'packages/angular/core/style/input.scss',
  'packages/angular/core/style/list.scss',
  'packages/angular/core/style/mat-autocomplete.scss',
  'packages/angular/core/style/mat-radio-group.scss',
  'packages/angular/core/style/menu.scss'
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
