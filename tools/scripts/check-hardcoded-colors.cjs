const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ts = require('typescript')

const repoRoot = process.cwd()
const scanRoots = [
  'apps/cloud/src',
  'libs/apps',
  'libs/component-angular',
  'libs/story-angular',
  'libs/formly',
  'packages/angular',
  'packages/ui',
  'legacies/copilot-angular/src'
]
const excludedFiles = new Set(['apps/cloud/src/styles/themes/base.scss'])
const fileExtensions = new Set(['.html', '.scss', '.css', '.ts', '.sass'])
const maxReportedRegressions = 80
const hardcodedColorFamilies = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'bluegray',
  'black',
  'white'
]
const utilityPrefixes = [
  'text',
  'bg',
  'border',
  'ring',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'outline',
  'decoration',
  'shadow'
]
const escapedUtilityPrefixes = utilityPrefixes.map(escapeForRegex).join('|')
const escapedColorFamilies = hardcodedColorFamilies.map(escapeForRegex).join('|')
const variantPrefixPattern = String.raw`(?:!?[\w-]+:|!?data-\[[^\]]+\]:|!?aria-\[[^\]]+\]:)*`
const utilityPattern = new RegExp(
  String.raw`(^|[^A-Za-z0-9_-])(${variantPrefixPattern}(?:${escapedUtilityPrefixes})-(?:${escapedColorFamilies})(?:-\d{2,3}|\/[\d.]+)?)`,
  'g'
)
const arbitraryUtilityPattern = new RegExp(
  String.raw`(^|[^A-Za-z0-9_-])(${variantPrefixPattern}(?:${escapedUtilityPrefixes})-(?:\[[^\]]*(?:#[0-9A-Fa-f]{3,8}\b|rgba?\([^)\]]+\)|hsla?\([^)\]]+\))[^\]]*\]|\([^\)]*(?:#[0-9A-Fa-f]{3,8}\b|rgba?\([^)\]]+\)|hsla?\([^)\]]+\))[^\)]*\)))`,
  'g'
)
const colorLiteralPattern = new RegExp(
  String.raw`(^|[^A-Za-z0-9_-])(#[0-9A-Fa-f]{3,8}\b|rgba?\([^)\n]+\)|hsla?\([^)\n]+\))`,
  'g'
)

const stagedMode = process.argv.includes('--staged')
const writeMode = process.argv.includes('--write-baseline')

if (writeMode) {
  console.error('check-hardcoded-colors: --write-baseline is no longer supported. The check is diff-based now.')
  process.exit(1)
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function hasHeadCommit() {
  return runGit(['rev-parse', '--verify', 'HEAD'], { allowFailure: true }) !== null
}

function shouldExcludePath(relativeFile) {
  if (excludedFiles.has(relativeFile)) {
    return true
  }

  if (relativeFile.includes('/node_modules/') || relativeFile.startsWith('node_modules/')) {
    return true
  }

  if (relativeFile.includes('/dist/') || relativeFile.startsWith('dist/')) {
    return true
  }

  if (relativeFile.includes('/assets/')) {
    return true
  }

  if (relativeFile.endsWith('.svg')) {
    return true
  }

  if (relativeFile.includes('.spec.') || relativeFile.includes('.stories.')) {
    return true
  }

  return false
}

function isInScanRoots(relativeFile) {
  return scanRoots.some((root) => relativeFile === root || relativeFile.startsWith(`${root}/`))
}

function isCandidateFile(relativeFile) {
  if (!isInScanRoots(relativeFile)) {
    return false
  }

  if (shouldExcludePath(relativeFile)) {
    return false
  }

  return fileExtensions.has(path.extname(relativeFile))
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
    if (isCandidateFile(relativeFile)) {
      files.push(relativeFile)
    }
  }

  return files
}

function getAllCandidateFiles() {
  const seen = new Set()
  const files = []

  for (const root of scanRoots) {
    const absoluteRoot = path.join(repoRoot, root)
    for (const file of walkFiles(absoluteRoot)) {
      if (seen.has(file)) {
        continue
      }

      seen.add(file)
      files.push(file)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function parseDiffPath(line) {
  if (line === '+++ /dev/null') {
    return null
  }

  const prefix = '+++ b/'
  if (!line.startsWith(prefix)) {
    return null
  }

  return toPosixPath(line.slice(prefix.length))
}

function parseDiffAddedLines(diffText) {
  const fileLineNumbers = new Map()
  let currentFile = null

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const parsedFile = parseDiffPath(line)
      currentFile = parsedFile && isCandidateFile(parsedFile) ? parsedFile : null
      continue
    }

    if (!currentFile) {
      continue
    }

    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!hunkMatch) {
      continue
    }

    const startLine = Number(hunkMatch[1])
    const lineCount = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2])
    if (lineCount <= 0) {
      continue
    }

    const changedLines = fileLineNumbers.get(currentFile) || new Set()
    for (let offset = 0; offset < lineCount; offset += 1) {
      changedLines.add(startLine + offset)
    }
    fileLineNumbers.set(currentFile, changedLines)
  }

  return fileLineNumbers
}

function getUntrackedCandidateFiles() {
  const output = runGit(['ls-files', '--others', '--exclude-standard', '-z'])

  return output
    .split('\0')
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => toPosixPath(file))
    .filter((file) => isCandidateFile(file))
    .sort((left, right) => left.localeCompare(right))
}

function readWorkingTreeFile(relativeFile) {
  return fs.readFileSync(path.join(repoRoot, relativeFile), 'utf8')
}

function readStagedFile(relativeFile) {
  return runGit(['show', `:${relativeFile}`])
}

function buildLineStarts(text) {
  const starts = [0]

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1)
    }
  }

  return starts
}

function getAllLineNumbers(text) {
  const lineCount = buildLineStarts(text).length
  const lines = new Set()

  for (let line = 1; line <= lineCount; line += 1) {
    lines.add(line)
  }

  return lines
}

function getLineAndColumn(lineStarts, index) {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER

    if (index < lineStart) {
      high = mid - 1
      continue
    }

    if (index >= nextStart) {
      low = mid + 1
      continue
    }

    return {
      line: mid + 1,
      column: index - lineStart + 1
    }
  }

  return {
    line: 1,
    column: index + 1
  }
}

function getContentSegments(relativeFile, content) {
  if (path.extname(relativeFile) !== '.ts') {
    return [{ text: content, startIndex: 0 }]
  }

  return getTypeScriptStringSegments(relativeFile, content)
}

function getTypeScriptStringSegments(relativeFile, content) {
  const sourceFile = ts.createSourceFile(
    relativeFile,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const segments = []

  function addSegment(start, end) {
    if (end <= start) {
      return
    }

    segments.push({
      text: content.slice(start, end),
      startIndex: start
    })
  }

  function addTemplateSegment(node, trailingDelimiterLength) {
    const start = node.getStart(sourceFile) + 1
    const end = node.end - trailingDelimiterLength
    addSegment(start, end)
  }

  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addSegment(node.getStart(sourceFile) + 1, node.end - 1)
    } else if (node.kind === ts.SyntaxKind.TemplateHead) {
      addTemplateSegment(node, 2)
    } else if (node.kind === ts.SyntaxKind.TemplateMiddle) {
      addTemplateSegment(node, 2)
    } else if (
      node.kind === ts.SyntaxKind.TemplateTail ||
      node.kind === ts.SyntaxKind.LastTemplateToken
    ) {
      addTemplateSegment(node, 1)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return segments
}

function collectOccurrences(relativeFile, content) {
  const lineStarts = buildLineStarts(content)
  const segments = getContentSegments(relativeFile, content)
  const utilityOccurrences = []
  const arbitraryOccurrences = []
  const protectedRanges = []

  for (const segment of segments) {
    const utilityMatches = matchPattern(relativeFile, lineStarts, segment, utilityPattern, 'utility')
    const arbitraryMatches = matchPattern(
      relativeFile,
      lineStarts,
      segment,
      arbitraryUtilityPattern,
      'arbitrary-value'
    )

    utilityOccurrences.push(...utilityMatches)
    arbitraryOccurrences.push(...arbitraryMatches)
    protectedRanges.push(...utilityMatches, ...arbitraryMatches)
  }

  const literalOccurrences = []
  for (const segment of segments) {
    const literalMatches = matchPattern(relativeFile, lineStarts, segment, colorLiteralPattern, 'literal')

    literalOccurrences.push(
      ...literalMatches.filter(
        (match) => !protectedRanges.some((range) => isOverlappingRange(match, range))
      )
    )
  }

  return [...utilityOccurrences, ...arbitraryOccurrences, ...literalOccurrences]
}

function matchPattern(relativeFile, lineStarts, segment, pattern, kind) {
  const matches = []
  pattern.lastIndex = 0
  let match = pattern.exec(segment.text)

  while (match) {
    const token = match[2]
    const segmentOffset = match.index + match[1].length
    const absoluteIndex = segment.startIndex + segmentOffset
    const { line, column } = getLineAndColumn(lineStarts, absoluteIndex)

    matches.push({
      file: relativeFile,
      kind,
      token,
      startIndex: absoluteIndex,
      endIndex: absoluteIndex + token.length,
      line,
      column
    })

    match = pattern.exec(segment.text)
  }

  return matches
}

function isOverlappingRange(left, right) {
  return left.startIndex < right.endIndex && right.startIndex < left.endIndex
}

function toEntryMap(occurrences) {
  const counters = new Map()

  for (const occurrence of occurrences) {
    const key = `${occurrence.file}::${occurrence.kind}::${occurrence.token}`
    const current = counters.get(key) || {
      file: occurrence.file,
      kind: occurrence.kind,
      token: occurrence.token,
      count: 0,
      occurrences: []
    }

    current.count += 1
    current.occurrences.push({
      line: occurrence.line,
      column: occurrence.column
    })
    counters.set(key, current)
  }

  return counters
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file)
    }

    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind)
    }

    return left.token.localeCompare(right.token)
  })
}

function formatOccurrence(entry, occurrence) {
  return `${entry.file}:${occurrence.line}:${occurrence.column} ${entry.kind} "${entry.token}"`
}

function collectChangedLinesForStagedMode() {
  const diffText = runGit(['diff', '--cached', '--no-color', '--unified=0', '--diff-filter=ACMR', '--relative'])
  return parseDiffAddedLines(diffText)
}

function collectChangedLinesForWorkingTreeMode() {
  if (!hasHeadCommit()) {
    const fileLineNumbers = new Map()

    for (const file of getAllCandidateFiles()) {
      const content = readWorkingTreeFile(file)
      fileLineNumbers.set(file, getAllLineNumbers(content))
    }

    return fileLineNumbers
  }

  const diffText = runGit(['diff', '--no-color', '--unified=0', '--diff-filter=ACMR', '--relative', 'HEAD'])
  const fileLineNumbers = parseDiffAddedLines(diffText)

  for (const file of getUntrackedCandidateFiles()) {
    const content = readWorkingTreeFile(file)
    fileLineNumbers.set(file, getAllLineNumbers(content))
  }

  return fileLineNumbers
}

function collectChangedLines(mode) {
  return mode === 'staged'
    ? collectChangedLinesForStagedMode()
    : collectChangedLinesForWorkingTreeMode()
}

function readFileForMode(relativeFile, mode) {
  return mode === 'staged' ? readStagedFile(relativeFile) : readWorkingTreeFile(relativeFile)
}

const mode = stagedMode ? 'staged' : 'working-tree'
const changedLinesByFile = collectChangedLines(mode)
const files = [...changedLinesByFile.keys()].sort((left, right) => left.localeCompare(right))
const regressions = []

for (const file of files) {
  const content = readFileForMode(file, mode)
  const changedLines = changedLinesByFile.get(file)
  if (!changedLines || changedLines.size === 0) {
    continue
  }

  const occurrences = collectOccurrences(file, content).filter((occurrence) =>
    changedLines.has(occurrence.line)
  )
  regressions.push(...occurrences)
}

const regressionEntries = sortEntries([...toEntryMap(regressions).values()])

if (regressionEntries.length > 0) {
  console.error('Hardcoded color usage check failed.')
  console.error(`Only added lines are checked. mode=${mode}`)

  let printed = 0
  for (const regression of regressionEntries) {
    for (const occurrence of regression.occurrences) {
      console.error(`- ${formatOccurrence(regression, occurrence)} count=${regression.count}`)
      printed += 1
      if (printed >= maxReportedRegressions) {
        break
      }
    }

    if (printed >= maxReportedRegressions) {
      break
    }
  }

  if (printed < regressions.length) {
    console.error(`- ... ${regressions.length - printed} more new occurrences`)
  }

  process.exit(1)
}

console.log(`Hardcoded color usage check passed. mode=${mode} files=${files.length} occurrences=0`)
