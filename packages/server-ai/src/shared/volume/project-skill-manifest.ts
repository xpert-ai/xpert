import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { ProjectContentIntegrityError } from './project-content-integrity'
import { VolumeHandle } from './volume'

export const PROJECT_SKILL_MANIFEST_PATH = 'skills/.project-skills.json'

export type ProjectSkillManifestEntry = {
    id: string
    name: string
    enabled: boolean
    source: 'repository' | 'upload' | 'legacy'
    description?: string
    version?: string
    skillIndexId?: string
    provider?: string
}

export type ProjectSkillManifest = {
    version: 1
    items: ProjectSkillManifestEntry[]
}

export async function readProjectSkillManifest(volumeRoot: string): Promise<ProjectSkillManifest> {
    let opened: Awaited<ReturnType<typeof VolumeHandle.openExistingFile>>
    try {
        opened = await VolumeHandle.openExistingFile(volumeRoot, PROJECT_SKILL_MANIFEST_PATH, {
            boundaryRoot: volumeRoot,
            flags: fsConstants.O_RDONLY
        })
    } catch (error) {
        if (isMissingFile(error)) return emptyProjectSkillManifest()
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'unavailable')
    }

    try {
        if (!opened.fileStat.isFile() || opened.fileStat.nlink !== 1) {
            throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'not_regular_file')
        }
        const parsed: unknown = JSON.parse(await opened.fileHandle.readFile({ encoding: 'utf8' }))
        return parseProjectSkillManifest(parsed)
    } catch (error) {
        if (error instanceof ProjectContentIntegrityError) throw error
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_json')
    } finally {
        await opened.fileHandle.close()
    }
}

export function emptyProjectSkillManifest(): ProjectSkillManifest {
    return { version: 1, items: [] }
}

export function normalizeProjectSkillId(value: string) {
    const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.' || normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
        throw new ProjectContentIntegrityError(`skills/${value}`, 'invalid_package_path')
    }
    return normalized
}

function parseProjectSkillManifest(value: unknown): ProjectSkillManifest {
    if (!isObject(value) || Reflect.get(value, 'version') !== 1) {
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_version')
    }
    const rawItems = Reflect.get(value, 'items')
    if (!Array.isArray(rawItems)) {
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_items')
    }
    return {
        version: 1,
        items: rawItems.map(parseProjectSkillManifestEntry)
    }
}

function parseProjectSkillManifestEntry(value: unknown): ProjectSkillManifestEntry {
    if (!isObject(value)) {
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_entry')
    }
    const id = readRequiredString(value, 'id')
    const name = readRequiredString(value, 'name')
    const enabled = Reflect.get(value, 'enabled')
    const source = Reflect.get(value, 'source')
    if (typeof enabled !== 'boolean' || !isProjectSkillSource(source)) {
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_entry')
    }
    return {
        id: normalizeProjectSkillId(id),
        name,
        enabled,
        source,
        ...optionalString(value, 'description'),
        ...optionalString(value, 'version'),
        ...optionalString(value, 'skillIndexId'),
        ...optionalString(value, 'provider')
    }
}

function isProjectSkillSource(value: unknown): value is ProjectSkillManifestEntry['source'] {
    return value === 'repository' || value === 'upload' || value === 'legacy'
}

function readRequiredString(value: object, key: string) {
    const item = Reflect.get(value, key)
    if (typeof item !== 'string' || !item.trim()) {
        throw new ProjectContentIntegrityError(PROJECT_SKILL_MANIFEST_PATH, 'invalid_entry')
    }
    return item.trim()
}

function optionalString(
    value: object,
    key: 'description' | 'version' | 'skillIndexId' | 'provider'
): Partial<ProjectSkillManifestEntry> {
    const item = Reflect.get(value, key)
    return typeof item === 'string' && item.trim() ? { [key]: item.trim() } : {}
}

function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown) {
    return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT'
}
