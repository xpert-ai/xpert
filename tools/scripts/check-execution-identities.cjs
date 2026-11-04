// Inspect context boundaries, not relation strings: ordinary data queries may load a role alone.
// Every low-level adapter is reviewed explicitly, including helpers without worker decorators.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const lowLevel = new Set(['captureRequestContext', 'runWithCapturedRequestContext', 'runWithRequestContext'])
const factoryOwner = 'packages/server/src/user/execution-identity/resolve-execution-identity.handler.ts'

function inspect(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const bindings = new Map()
  const namespaces = new Set()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const imports = statement.importClause?.namedBindings
    if (imports && ts.isNamedImports(imports))
      for (const item of imports.elements) bindings.set(item.name.text, (item.propertyName || item.name).text)
    if (
      imports &&
      ts.isNamespaceImport(imports) &&
      /request-context|execution-identity|plugin-sdk|server-core/.test(statement.moduleSpecifier.text)
    )
      namespaces.add(imports.name.text)
  }
  const name = (expression) =>
    ts.isIdentifier(expression)
      ? bindings.get(expression.text) || expression.text
      : (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
          ts.isIdentifier(expression.expression) &&
          namespaces.has(expression.expression.text)
        ? ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : ts.isStringLiteral(expression.argumentExpression)
            ? expression.argumentExpression.text
            : ''
        : ''
  const issues = []
  function issue(node, kind) {
    issues.push({ name: kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) bindings.set(node.name.text, name(node.initializer))
      if (
        ts.isObjectBindingPattern(node.name) &&
        ts.isIdentifier(node.initializer) &&
        namespaces.has(node.initializer.text)
      )
        for (const element of node.name.elements)
          if (ts.isIdentifier(element.name))
            bindings.set(element.name.text, element.propertyName?.getText(source) || element.name.text)
    }
    if (ts.isCallExpression(node) && lowLevel.has(name(node.expression))) issue(node, name(node.expression))
    if (ts.isNewExpression(node) && name(node.expression) === 'RequestContext') issue(node, 'new RequestContext')
    // Ordinary consumers cannot mint a resolved identity, even via an aliased import.
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      name(node.expression) === 'createExecutionIdentity' &&
      file !== factoryOwner
    )
      issue(
        node,
        file === 'packages/server-ai/src/xpert/assistant-principal/resolve-assistant-principal.handler.ts'
          ? 'Assistant domain identity adapter'
          : 'forbidden identity factory'
      )
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
      for (const element of node.exportClause.elements)
        if ((element.propertyName || element.name).text === 'createExecutionIdentity')
          issue(
            node,
            file === 'packages/server/src/user/execution-identity/index.ts'
              ? 'host identity factory export'
              : 'forbidden identity factory export'
          )
    ts.forEachChild(node, visit)
  }
  visit(source)
  return issues
}

function check(staged) {
  const git = (args, options = {}) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...options })
  const root = git(['rev-parse', '--show-toplevel']).trim()
  const policyFile = 'tools/scripts/execution-identity-adapters.json'
  const files = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean))
  if (!staged)
    for (const file of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))
      files.add(file)
  const sources = [...files].filter(
    (file) => /^packages\/(server|server-ai)\/src\/.*\.ts$/.test(file) && !/\.(spec|fixture)\.ts$/.test(file)
  )
  let read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  if (staged) {
    // Read the index in one batch. Working-tree edits must not satisfy or evade a staged check.
    const entries = [policyFile, ...sources]
    const output = git(['cat-file', '--batch'], { input: entries.map((file) => `:${file}\n`).join(''), encoding: null })
    const content = new Map()
    let offset = 0
    for (const file of entries) {
      const end = output.indexOf(10, offset)
      const header = output.subarray(offset, end).toString('utf8')
      const size = Number(header.split(' ')[2])
      if (!Number.isSafeInteger(size)) throw new Error(`Cannot read staged identity source: ${file}`)
      offset = end + 1
      content.set(file, output.subarray(offset, offset + size).toString('utf8'))
      offset += size + 1
    }
    read = (file) => content.get(file)
  }
  const policy = JSON.parse(read(policyFile))
  const failures = []
  for (const file of sources) {
    const issues = inspect(read(file), file)
    const allowance = policy[file]
    if (
      issues.some((issue) => issue.name.startsWith('forbidden')) ||
      issues.length !== (allowance?.calls || 0) ||
      (allowance && (!Number.isSafeInteger(allowance.calls) || allowance.calls < 1 || !allowance.reason?.trim()))
    )
      failures.push(
        `${file}: ${issues.map((issue) => `${issue.line} ${issue.name}`).join(', ')}; reviewed calls=${allowance?.calls || 0}`
      )
  }
  for (const file of Object.keys(policy)) if (!sources.includes(file)) failures.push(`Stale adapter: ${file}`)
  if (failures.length) {
    console.error(
      'Execution contexts require the shared identity boundary or an explicitly reviewed credential/continuation adapter.'
    )
    console.error(failures.join('\n'))
    return 1
  }
  console.log('Execution identity boundary check passed.')
  return 0
}
module.exports = { inspect }
if (require.main === module) process.exitCode = check(process.argv.includes('--staged'))
