const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const baselinePath = path.join(repoRoot, 'tools/baselines/legacy-color-usage.json')
const scanRoots = [
  path.join(repoRoot, 'apps/cloud/src/app'),
  path.join(repoRoot, 'apps/cloud/src/styles'),
  path.join(repoRoot, 'packages/angular')
]
const fileExtensions = new Set(['.html', '.scss', '.css', '.ts', '.sass'])

const legacyColorPattern =
  /(?:dark:)?(?:text|bg|border|hover:bg|hover:text|focus:bg|focus:border|placeholder:text|ring|fill|stroke)-(?:gray|zinc|neutral|slate|stone|bluegray)(?:-\[[^\]]+\]|-[^\s"'`]+|\/\d+)?|dark:(?:text|bg|border|hover:bg|hover:text|focus:bg|focus:border|placeholder:text|ring|fill|stroke)-(?:white|black)(?:-[^\s"'`]+|\/\d+)?/g

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
      continue
    }

    if (fileExtensions.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }

  return files
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function collectMatches() {
  const counters = new Map()

  for (const root of scanRoots) {
    if (!fs.existsSync(root)) continue

    for (const file of walk(root)) {
      const relativeFile = toPosixPath(path.relative(repoRoot, file))
      const content = fs.readFileSync(file, 'utf8')
      const matches = content.match(legacyColorPattern) || []

      for (const match of matches) {
        const key = `${relativeFile}::${match}`
        const current = counters.get(key) || {
          file: relativeFile,
          match,
          count: 0
        }
        current.count += 1
        counters.set(key, current)
      }
    }
  }

  return [...counters.values()].sort((left, right) => {
    if (left.file === right.file) {
      return left.match.localeCompare(right.match)
    }
    return left.file.localeCompare(right.file)
  })
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return []
  }

  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  return Array.isArray(parsed.entries) ? parsed.entries : []
}

function toMap(entries) {
  return new Map(entries.map((entry) => [`${entry.file}::${entry.match}`, entry.count]))
}

function writeBaseline(entries) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
    'utf8'
  )
}

const writeMode = process.argv.includes('--write-baseline')
const currentEntries = collectMatches()

if (writeMode) {
  writeBaseline(currentEntries)
  console.log(
    `Legacy color baseline updated: entries=${currentEntries.length} file=${toPosixPath(
      path.relative(repoRoot, baselinePath)
    )}`
  )
  process.exit(0)
}

const baselineEntries = loadBaseline()
const baselineMap = toMap(baselineEntries)
const currentMap = toMap(currentEntries)
const regressions = []
const cleaned = []

for (const entry of currentEntries) {
  const key = `${entry.file}::${entry.match}`
  const baselineCount = baselineMap.get(key) || 0

  if (entry.count > baselineCount) {
    regressions.push({
      ...entry,
      added: entry.count - baselineCount
    })
  }
}

for (const entry of baselineEntries) {
  const key = `${entry.file}::${entry.match}`
  const currentCount = currentMap.get(key) || 0

  if (currentCount < entry.count) {
    cleaned.push({
      ...entry,
      removed: entry.count - currentCount
    })
  }
}

if (regressions.length > 0) {
  console.error('Legacy color usage check failed.')
  console.error(`Baseline file: ${toPosixPath(path.relative(repoRoot, baselinePath))}`)

  for (const regression of regressions.slice(0, 80)) {
    console.error(
      `- ${regression.file}: "${regression.match}" count=${regression.count} baseline=${regression.count - regression.added} added=${regression.added}`
    )
  }

  if (regressions.length > 80) {
    console.error(`- ... ${regressions.length - 80} more`)
  }

  process.exit(1)
}

console.log(
  `Legacy color usage check passed. current=${currentEntries.length} baseline=${baselineEntries.length} cleaned=${cleaned.length}`
)
