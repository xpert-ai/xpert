#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = '/Users/xpertai03/GitHub/xpert'
const roots = ['apps', 'libs', 'packages', 'legacies']
const includedExtensions = new Set(['.html', '.ts'])
const skipDirs = new Set(['.git', 'dist', 'node_modules', '.nx', 'coverage'])

const materialIconSource = ['@angular', 'material', 'icon'].join('/')
const legacyIconModule = ['Mat', 'IconModule'].join('')
const zardIconComponent = 'ZardIconComponent'
const legacyIconTag = ['mat', 'icon'].join('-')
const legacyIconTagPattern = new RegExp(`<${legacyIconTag}\\b([^>]*)>([\\s\\S]*?)<\\/${legacyIconTag}>`, 'g')

let updatedFiles = 0

for (const relativeRoot of roots) {
  walk(path.join(rootDir, relativeRoot))
}

console.log(`Updated ${updatedFiles} files`)

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    if (skipDirs.has(entry)) {
      continue
    }

    const fullPath = path.join(dirPath, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (!includedExtensions.has(path.extname(fullPath))) {
      continue
    }

    const original = readFileSync(fullPath, 'utf8')
    const migrated = migrateFile(original, fullPath)
    if (migrated !== original) {
      writeFileSync(fullPath, migrated)
      updatedFiles += 1
    }
  }
}

function migrateFile(content, filePath) {
  const hasLegacyIconTag = content.includes(`<${legacyIconTag}`)
  const hasLegacyIconModule = path.extname(filePath) === '.ts' && content.includes(legacyIconModule)

  if (!hasLegacyIconTag && !hasLegacyIconModule) {
    return content
  }

  let next = hasLegacyIconTag
    ? content.replace(legacyIconTagPattern, (_match, attrs, inner) => migrateMatIconTag(attrs, inner))
    : content

  if (hasLegacyIconModule) {
    next = migrateTypeScriptImports(next)
  }

  return next
}

function migrateMatIconTag(attrs, inner) {
  const trimmedInner = inner.trim()
  const additions = []

  if (!hasAttribute(attrs, 'zType') && !hasAttribute(attrs, '[zType]') && trimmedInner) {
    const interpolation = trimmedInner.match(/^{{([\s\S]+)}}$/)
    if (interpolation) {
      additions.push(`[zType]="${interpolation[1].trim()}"`)
    } else if (!trimmedInner.includes('<')) {
      additions.push(`zType="${escapeAttribute(trimmedInner)}"`)
    }
  }

  const suffix = additions.length ? ` ${additions.join(' ')}` : ''
  return `<z-icon${attrs}${suffix}></z-icon>`
}

function migrateTypeScriptImports(content) {
  const lines = content.split('\n')
  let nextLines = []
  let foundHeadlessImport = false
  let importedZardIcon = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.includes(materialIconSource)) {
      const match = trimmed.match(/^import\s*\{([^}]*)\}\s*from\s*['"]@angular\/material\/icon['"]\s*;?$/)
      if (match) {
        const remaining = parseImportSpecifiers(match[1]).filter(
          (specifier) => baseImportName(specifier) !== legacyIconModule
        )
        if (remaining.length) {
          nextLines.push(`import { ${remaining.join(', ')} } from '${materialIconSource}'`)
        }
        continue
      }
    }

    if (trimmed.includes("@xpert-ai/headless-ui")) {
      const match = trimmed.match(/^import\s*\{([^}]*)\}\s*from\s*['"]@xpert-ai\/headless-ui['"]\s*;?$/)
      if (match) {
        foundHeadlessImport = true
        const specifiers = parseImportSpecifiers(match[1])
        if (specifiers.some((specifier) => baseImportName(specifier) === zardIconComponent)) {
          importedZardIcon = true
          nextLines.push(line)
        } else {
          specifiers.push(zardIconComponent)
          nextLines.push(`import { ${Array.from(new Set(specifiers)).sort().join(', ')} } from '@xpert-ai/headless-ui'`)
          importedZardIcon = true
        }
        continue
      }
    }

    nextLines.push(line)
  }

  let next = nextLines.join('\n')
  if (!next.includes(legacyIconModule)) {
    return next
  }

  next = next.replace(new RegExp(`\\b${legacyIconModule}\\b`, 'g'), zardIconComponent)

  if (importedZardIcon || !next.includes(zardIconComponent)) {
    return next
  }

  nextLines = next.split('\n')
  const zardImportLine = `import { ${zardIconComponent} } from '@xpert-ai/headless-ui'`
  if (foundHeadlessImport) {
    return next
  }

  const importMatches = Array.from(
    next.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?(?:\r?\n|$)/gm)
  )

  if (importMatches.length) {
    const lastImport = importMatches.at(-1)
    const insertAt = lastImport.index + lastImport[0].length
    return `${next.slice(0, insertAt)}${zardImportLine}\n${next.slice(insertAt)}`
  }

  return `${zardImportLine}\n${next}`
}

function parseImportSpecifiers(specifiers) {
  return specifiers
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function baseImportName(specifier) {
  return specifier.split(/\s+as\s+/i)[0]?.trim()
}

function hasAttribute(attrs, attributeName) {
  return new RegExp(`(^|\\s)${escapeRegex(attributeName)}(?=(\\s|=|$))`).test(attrs)
}

function escapeAttribute(value) {
  return value.replace(/"/g, '&quot;')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
