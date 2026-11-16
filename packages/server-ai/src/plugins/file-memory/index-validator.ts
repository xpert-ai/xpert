import path from 'node:path'
import { FileMemoryIndexIssue, FileMemoryIndexValidationResult } from './types'
import { inferFileMemoryTypeFromPath, normalizeFileMemoryRelativePath } from './paths'

const MARKDOWN_LINK_PATTERN = /\[[^\]]+]\(([^)]+)\)/g
const MAX_INDEX_LINE_LENGTH = 220
const BODY_LIKE_LINE_PATTERN = /^\s*(?:#{2,}|\d+\.|-)\s+(?:why|how|原因|背景|步骤|内容|证据|更新历史)[:：]?/i

export function validateFileMemoryIndex(
    content: string,
    options: {
        existingPaths: Iterable<string>
        archivedPaths?: Iterable<string>
    }
): FileMemoryIndexValidationResult {
    const existingPaths = new Set(Array.from(options.existingPaths, normalizeFileMemoryRelativePath))
    const archivedPaths = new Set(Array.from(options.archivedPaths ?? [], normalizeFileMemoryRelativePath))
    const issues: FileMemoryIndexIssue[] = []
    const seenTargets = new Set<string>()
    const lines = content.split(/\r?\n/)

    lines.forEach((line, index) => {
        const lineNumber = index + 1
        if (line.length > MAX_INDEX_LINE_LENGTH) {
            issues.push({
                type: 'overlong-entry',
                line: lineNumber,
                message: `MEMORY.md index line is longer than ${MAX_INDEX_LINE_LENGTH} characters`
            })
        }

        if (BODY_LIKE_LINE_PATTERN.test(line)) {
            issues.push({
                type: 'body-like-entry',
                line: lineNumber,
                message: 'MEMORY.md should stay a navigation index, not store topic body content'
            })
        }

        for (const target of extractMarkdownLinkTargets(line)) {
            const normalizedTarget = normalizeIndexTarget(target)
            if (!normalizedTarget) {
                issues.push({
                    type: 'invalid-target',
                    line: lineNumber,
                    target,
                    message: 'MEMORY.md link target is invalid'
                })
                continue
            }

            if (seenTargets.has(normalizedTarget)) {
                issues.push({
                    type: 'duplicate-target',
                    line: lineNumber,
                    target: normalizedTarget,
                    message: 'MEMORY.md links the same topic more than once'
                })
            }
            seenTargets.add(normalizedTarget)

            if (!inferFileMemoryTypeFromPath(normalizedTarget)) {
                issues.push({
                    type: 'invalid-target',
                    line: lineNumber,
                    target: normalizedTarget,
                    message: 'MEMORY.md link target must point into user/, feedback/, project/, or reference/'
                })
            }

            if (!existingPaths.has(normalizedTarget)) {
                issues.push({
                    type: 'missing-target',
                    line: lineNumber,
                    target: normalizedTarget,
                    message: 'MEMORY.md link target does not exist'
                })
            }

            if (archivedPaths.has(normalizedTarget)) {
                issues.push({
                    type: 'archived-target',
                    line: lineNumber,
                    target: normalizedTarget,
                    message: 'Archived memory topic should not appear in the main MEMORY.md index'
                })
            }
        }
    })

    return {
        ok: issues.length === 0,
        issues
    }
}

function extractMarkdownLinkTargets(line: string) {
    const targets: string[] = []
    let match: RegExpExecArray | null
    MARKDOWN_LINK_PATTERN.lastIndex = 0
    while ((match = MARKDOWN_LINK_PATTERN.exec(line))) {
        targets.push(match[1])
    }
    return targets
}

function normalizeIndexTarget(target: string) {
    const withoutAnchor = target.split('#')[0].trim()
    if (!withoutAnchor || /^[a-z][a-z0-9+.-]*:/i.test(withoutAnchor)) {
        return ''
    }
    try {
        const normalized = normalizeFileMemoryRelativePath(path.posix.normalize(withoutAnchor))
        return normalized.endsWith('.md') ? normalized : ''
    } catch {
        return ''
    }
}
