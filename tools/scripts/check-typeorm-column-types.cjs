const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ts = require('typescript')

const repoRoot = resolveRepoRoot()
const stagedMode = process.argv.includes('--staged')
const scanRoots = ['apps', 'libs', 'legacies', 'packages']
const knownScalarTypeReferences = new Set(['Date', 'ID'])
const primitiveKinds = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword])
const nullishKinds = new Set([ts.SyntaxKind.NullKeyword, ts.SyntaxKind.UndefinedKeyword])

function resolveRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    }).trim()
  } catch {
    return process.cwd()
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function runGit(args, options = {}) {
  const { allowFailure = false, ...rest } = options

  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      ...rest
    })
  } catch (error) {
    if (allowFailure) {
      return null
    }

    throw error
  }
}

function shouldExcludePath(relativeFile) {
  return (
    relativeFile.includes('/node_modules/') ||
    relativeFile.startsWith('node_modules/') ||
    relativeFile.includes('/dist/') ||
    relativeFile.startsWith('dist/') ||
    relativeFile.includes('/coverage/') ||
    relativeFile.startsWith('coverage/')
  )
}

function isEntityFile(relativeFile) {
  return relativeFile.endsWith('.entity.ts') && !shouldExcludePath(relativeFile)
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, files)
      continue
    }

    const relativeFile = toPosixPath(path.relative(repoRoot, fullPath))
    if (isEntityFile(relativeFile)) {
      files.push(relativeFile)
    }
  }

  return files
}

function getStagedEntityFiles() {
  const output = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { allowFailure: true })
  if (!output) {
    return []
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isEntityFile)
    .filter((relativeFile) => fs.existsSync(path.join(repoRoot, relativeFile)))
}

function getFilesToScan() {
  if (stagedMode) {
    return getStagedEntityFiles()
  }

  return scanRoots.flatMap((root) => walkFiles(path.join(repoRoot, root)))
}

function getDecorators(node) {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) || []
  }

  return node.decorators ? Array.from(node.decorators) : []
}

function getColumnCall(decorator) {
  const expression = decorator.expression
  return ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'Column'
    ? expression
    : null
}

function getColumnDecoratorCall(node) {
  for (const decorator of getDecorators(node)) {
    const call = getColumnCall(decorator)
    if (call) {
      return call
    }
  }

  return null
}

function hasExplicitColumnType(call) {
  if (!call || call.arguments.length === 0) {
    return false
  }

  const firstArg = call.arguments[0]
  if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
    return true
  }

  if (!ts.isObjectLiteralExpression(firstArg)) {
    return false
  }

  return firstArg.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false
    }

    return (
      (ts.isIdentifier(property.name) && property.name.text === 'type') ||
      (ts.isStringLiteral(property.name) && property.name.text === 'type')
    )
  })
}

function isNullishType(typeNode) {
  return (
    nullishKinds.has(typeNode.kind) ||
    (ts.isLiteralTypeNode(typeNode) && nullishKinds.has(typeNode.literal.kind))
  )
}

function isPrimitiveType(typeNode) {
  return primitiveKinds.has(typeNode.kind)
}

function isPrimitiveNullableUnion(typeNode) {
  if (!ts.isUnionTypeNode(typeNode) || !typeNode.types.some(isNullishType)) {
    return false
  }

  return typeNode.types.filter((member) => !isNullishType(member)).every(isPrimitiveType)
}

function isLiteralUnion(typeNode) {
  return (
    ts.isUnionTypeNode(typeNode) &&
    typeNode.types.filter((member) => !isNullishType(member)).every((member) => ts.isLiteralTypeNode(member))
  )
}

function getTypeReferenceName(typeNode) {
  if (!ts.isTypeReferenceNode(typeNode)) {
    return null
  }

  return typeNode.typeName.getText()
}

function classifyUnsafeColumnType(typeNode) {
  if (!typeNode) {
    return {
      reason: 'missing TypeScript property type',
      advice: 'add an explicit TypeORM column type and a concrete property type'
    }
  }

  if (isPrimitiveType(typeNode)) {
    return null
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = getTypeReferenceName(typeNode)
    if (knownScalarTypeReferences.has(typeName)) {
      return null
    }

    return {
      reason: `type reference "${typeName}" can emit unstable decorator metadata`,
      advice: "add an explicit TypeORM column type, such as type: 'varchar', 'int', 'json', or 'jsonb'"
    }
  }

  if (isPrimitiveNullableUnion(typeNode)) {
    return null
  }

  if (isLiteralUnion(typeNode) || ts.isUnionTypeNode(typeNode)) {
    return {
      reason: 'union or literal-union property type can emit Object metadata in production builds',
      advice: "add an explicit TypeORM column type, usually type: 'varchar' for string unions or type: 'int' for numeric unions"
    }
  }

  if (
    ts.isArrayTypeNode(typeNode) ||
    ts.isTupleTypeNode(typeNode) ||
    ts.isTypeLiteralNode(typeNode) ||
    typeNode.kind === ts.SyntaxKind.AnyKeyword ||
    typeNode.kind === ts.SyntaxKind.UnknownKeyword ||
    typeNode.kind === ts.SyntaxKind.ObjectKeyword
  ) {
    return {
      reason: 'object-like, array, any, unknown, or inline type-literal column requires an explicit storage type',
      advice: "add an explicit TypeORM column type, usually type: 'json' or type: 'jsonb'"
    }
  }

  return null
}

function findColumnTypeIssues(relativeFile) {
  const absoluteFile = path.join(repoRoot, relativeFile)
  const sourceText = fs.readFileSync(absoluteFile, 'utf8')
  const sourceFile = ts.createSourceFile(absoluteFile, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const issues = []

  function visit(node) {
    if (ts.isPropertyDeclaration(node)) {
      const columnCall = getColumnDecoratorCall(node)
      if (columnCall && !hasExplicitColumnType(columnCall)) {
        const issue = classifyUnsafeColumnType(node.type)
        if (issue) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          issues.push({
            file: relativeFile,
            line: position.line + 1,
            column: position.character + 1,
            property: node.name.getText(sourceFile),
            type: node.type ? node.type.getText(sourceFile) : '<missing>',
            ...issue
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
}

const files = Array.from(new Set(getFilesToScan())).sort()
const issues = files.flatMap(findColumnTypeIssues)

if (issues.length) {
  console.error('TypeORM column type check failed.')
  console.error('Do not rely on reflect-metadata for unsafe @Column property types.\n')

  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line}:${issue.column} ${issue.property}: ${issue.type}`)
    console.error(`  reason: ${issue.reason}`)
    console.error(`  fix: ${issue.advice}\n`)
  }

  process.exit(1)
}

const scope = stagedMode ? 'staged entity files' : `${files.length} entity files`
console.log(`TypeORM column type check passed (${scope}).`)
