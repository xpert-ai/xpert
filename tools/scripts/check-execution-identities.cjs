// Inspect syntax and imported bindings, not relation strings: ordinary data queries may legitimately load a role alone.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const lowLevel = new Set(['captureRequestContext', 'runWithCapturedRequestContext', 'runWithRequestContext'])

function inspect(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const bindings = new Map()
  const namespaces = new Set()
  let background = false
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const module = statement.moduleSpecifier.text
    const imports = statement.importClause?.namedBindings
    if (imports && ts.isNamedImports(imports))
      for (const item of imports.elements) bindings.set(item.name.text, (item.propertyName || item.name).text)
    if (imports && ts.isNamespaceImport(imports) && /request-context|plugin-sdk|server-core/.test(module))
      namespaces.add(imports.name.text)
  }
  const name = (expression) =>
    ts.isIdentifier(expression)
      ? bindings.get(expression.text) || expression.text
      : ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          namespaces.has(expression.expression.text)
        ? expression.name.text
        : ''
  const issues = []
  function visit(node) {
    if (
      ts.isDecorator(node) &&
      ts.isCallExpression(node.expression) &&
      ['Processor', 'Process', 'Cron', 'Interval', 'Timeout'].includes(name(node.expression.expression))
    )
      background = true
    if (
      ts.isHeritageClause(node) &&
      node.types.some((item) =>
        ['WorkerHost', 'ManagedQueueProcessor', 'SandboxBrowserManagedQueueProcessor'].includes(name(item.expression))
      )
    )
      background = true
    if (ts.isCallExpression(node) && lowLevel.has(name(node.expression))) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      issues.push({ name: name(node.expression), line: position.line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return background ? issues : []
}

function check(staged) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
  const root = git(['rev-parse', '--show-toplevel']).trim()
  const read = (file) => (staged ? git(['show', `:${file}`]) : fs.readFileSync(path.join(root, file), 'utf8'))
  const policyFile = 'tools/scripts/execution-identity-adapters.json'
  const policy = JSON.parse(read(policyFile))
  const files = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean))
  if (!staged)
    for (const file of git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))
      files.add(file)
  const failures = []
  for (const file of files) {
    if (!/^packages\/(server|server-ai)\/src\/.*\.ts$/.test(file) || /\.(spec|fixture)\.ts$/.test(file)) continue
    const issues = inspect(read(file), file)
    const allowance = policy[file]
    if (issues.length > (allowance?.calls || 0))
      for (const issue of issues) failures.push(`${file}:${issue.line}: ${issue.name}`)
  }
  if (failures.length) {
    console.error(
      'Background execution must use ResolveExecutionIdentityCommand and runWithExecutionIdentity. Reviewed credential adapters are explicitly inventoried.'
    )
    console.error(failures.join('\n'))
    return 1
  }
  console.log('Execution identity boundary check passed.')
  return 0
}
module.exports = { inspect }
if (require.main === module) process.exitCode = check(process.argv.includes('--staged'))
