import yaml from 'yaml'
import { FileMemoryDocument, FileMemoryFrontmatter, FileMemoryStatus, FILE_MEMORY_STATUSES } from './types'
import { isFileMemoryType } from './taxonomy'
import { mergeFileMemoryUsage } from './usage'

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/

export function parseFileMemoryMarkdown(markdown: string): FileMemoryDocument {
    const match = FRONTMATTER_PATTERN.exec(markdown)
    if (!match) {
        throw new Error('File memory frontmatter is required')
    }

    const parsed = yaml.parse(match[1])
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('File memory frontmatter must be an object')
    }

    const frontmatter = normalizeFileMemoryFrontmatter(parsed as Record<string, unknown>)
    return {
        frontmatter,
        body: markdown.slice(match[0].length)
    }
}

export function renderFileMemoryMarkdown(document: FileMemoryDocument) {
    const frontmatter = normalizeFileMemoryFrontmatter(document.frontmatter)
    const serialized = yaml.stringify(frontmatter).trimEnd()
    const body = document.body.replace(/^\s+/, '').trimEnd()
    return `---\n${serialized}\n---\n\n${body}\n`
}

export function normalizeFileMemoryFrontmatter(input: Record<string, unknown>): FileMemoryFrontmatter {
    const type = input.type
    if (!isFileMemoryType(type)) {
        throw new Error(`Invalid file memory type: ${String(type)}`)
    }

    const status: FileMemoryStatus = isFileMemoryStatus(input.status) ? input.status : 'active'

    const title = normalizeRequiredText(input.title, 'title')
    const summary = normalizeRequiredText(input.summary, 'summary')
    const scopeId = normalizeRequiredText(input.scopeId, 'scopeId')
    const id = normalizeRequiredText(input.id, 'id')

    return {
        id,
        scopeType: 'xpert',
        scopeId,
        type,
        status,
        title,
        summary,
        confidence: normalizeOptionalNumber(input.confidence),
        usage: mergeFileMemoryUsage(input.usage as Partial<FileMemoryFrontmatter['usage']> | undefined),
        createdAt: normalizeOptionalText(input.createdAt),
        updatedAt: normalizeOptionalText(input.updatedAt),
        createdBy: normalizeOptionalText(input.createdBy),
        updatedBy: normalizeOptionalText(input.updatedBy),
        source: normalizeSource(input.source),
        sourceRefs: normalizeStringArray(input.sourceRefs),
        tags: normalizeStringArray(input.tags)
    }
}

function normalizeRequiredText(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`File memory frontmatter field "${field}" is required`)
    }
    return value.trim()
}

function normalizeOptionalText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeSource(value: unknown): FileMemoryFrontmatter['source'] {
    if (
        value === 'explicit' ||
        value === 'writeback' ||
        value === 'dream' ||
        value === 'imported' ||
        value === 'manual'
    ) {
        return value
    }
    return undefined
}

function isFileMemoryStatus(value: unknown): value is FileMemoryStatus {
    return typeof value === 'string' && FILE_MEMORY_STATUSES.includes(value as FileMemoryStatus)
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return undefined
    }
    const items = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return items.length ? Array.from(new Set(items.map((item) => item.trim()))) : undefined
}
