// Check new imports against HEAD using index blobs in staged mode, including partial staging and renames.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')

const isServerCore = (name) => name === '@xpert-ai/server-core' || name.startsWith('@xpert-ai/server-core/')

function findImports(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const issues = []
  const namespaces = new Set()
  const add = (node, binding) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
    issues.push({ binding, line: line + 1, column: character + 1 })
  }
  const moduleName = (node) => {
    if (!ts.isCallExpression(node) || node.arguments.length !== 1) return null
    if (!(ts.isIdentifier(node.expression) && node.expression.text === 'require')) return null
    return ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null
  }
  const inspectBinding = (binding) => {
    if (ts.isIdentifier(binding)) namespaces.add(binding.text)
    else if (ts.isObjectBindingPattern(binding))
      for (const element of binding.elements)
        if ((element.propertyName || element.name).getText(source) === 'RequestContext')
          add(element, `import:${element.name.getText(source)}`)
  }
  for (const node of source.statements) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isServerCore(node.moduleSpecifier.text)
    ) {
      const binding = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause
      if (binding && (ts.isNamedImports(binding) || ts.isNamedExports(binding))) {
        for (const element of binding.elements)
          if ((element.propertyName || element.name).text === 'RequestContext')
            add(element, `${ts.isImportDeclaration(node) ? 'import' : 'export'}:${element.name.text}`)
      } else if (binding && ts.isNamespaceImport(binding)) namespaces.add(binding.name.text)
    }
  }
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && isServerCore(moduleName(node.initializer) || ''))
      inspectBinding(node.name)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const visitUsage = (node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const property = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression
      const name = typeof property === 'string' ? property : ts.isStringLiteral(property) ? property.text : ''
      if (
        name === 'RequestContext' &&
        ((ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) ||
          isServerCore(moduleName(node.expression) || ''))
      )
        add(node, `namespace:${node.expression.getText(source)}`)
    }
    ts.forEachChild(node, visitUsage)
  }
  visitUsage(source)
  return issues
}

function addedImports(previous, next, file) {
  const counts = new Map()
  for (const issue of findImports(previous, file)) counts.set(issue.binding, (counts.get(issue.binding) || 0) + 1)
  return findImports(next, file).filter((issue) => {
    const count = counts.get(issue.binding) || 0
    if (!count) return true
    counts.set(issue.binding, count - 1)
    return false
  })
}

function check(staged) {
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const root = git(['rev-parse', '--show-toplevel']).trim()
  const readHead = (file) => {
    try {
      return git(['show', `HEAD:${file}`])
    } catch {
      return ''
    }
  }
  let hasHead = true
  try {
    git(['rev-parse', '--verify', 'HEAD'])
  } catch {
    hasHead = false
  }
  const changes = git([
    'diff',
    ...(staged ? ['--cached'] : []),
    ...(hasHead ? ['HEAD'] : []),
    '--name-status',
    '-z',
    '--find-renames',
    '--diff-filter=ACMR'
  ]).split('\0')
  const files = new Map()
  for (let index = 0; index < changes.length && changes[index]; ) {
    const status = changes[index++]
    const oldPath = changes[index++]
    const file = /^[RC]/.test(status) ? changes[index++] : oldPath
    files.set(file, oldPath)
  }
  if (!staged)
    for (const file of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))
      files.set(file, file)
  const issues = []
  for (const [file, oldPath] of files) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) continue
    const next = staged ? git(['show', `:${file}`]) : fs.readFileSync(path.join(root, file), 'utf8')
    for (const issue of addedImports(readHead(oldPath), next, file)) issues.push({ ...issue, file })
  }
  if (issues.length) {
    console.error('RequestContext import check failed. Import RequestContext from @xpert-ai/plugin-sdk in new code.')
    for (const issue of issues)
      console.error(`${issue.file}:${issue.line}:${issue.column}: new server-core RequestContext import or access`)
    return 1
  }
  console.log(`RequestContext import check passed (${staged ? 'staged changes' : 'working tree changes'}).`)
  return 0
}

module.exports = { findImports, addedImports }
if (require.main === module) {
  try {
    process.exitCode = check(process.argv.includes('--staged'))
  } catch (error) {
    console.error(`RequestContext import check could not run: ${error.message}`)
    process.exitCode = 1
  }
}
