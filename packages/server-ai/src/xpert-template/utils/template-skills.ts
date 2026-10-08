import { Logger } from '@nestjs/common'
import type { ISkillMarketFeaturedRef, ISkillRepository } from '@xpert-ai/contracts'
import { getErrorMessage, yaml } from '@xpert-ai/server-common'
import { Cache } from 'cache-manager'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
    TEMPLATE_SKILL_BUNDLE_LOCAL_PROVIDER,
    TEMPLATE_SKILL_BUNDLE_LOCAL_REPOSITORY,
    TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE,
    TEMPLATE_SKILL_BUNDLE_SEPARATOR,
    TEMPLATE_SKILL_BUNDLE_SHARED_PREFIX,
    TEMPLATE_SKILL_BUNDLE_SKILL_FILE
} from '../template.constants'
import type { TTemplateSkillBundle, TWorkspaceDefaultSkillRef } from '../template.types'
import { isObjectValue, isWorkspaceDefaultSkillRef } from './template-config'
import { pathExists } from './template-files'

const logger = new Logger('TemplateSkillBundles')

async function readSkillBundleManifest(filePath: string, directoryName: string, templateRoot: string) {
    try {
        return yaml.parse(await fs.promises.readFile(filePath, 'utf8'))
    } catch (error) {
        throw new Error(
            `Failed to read template skill bundle manifest '${directoryName}' at '${filePath}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
        )
    }
}

export async function getTemplateSkillBundles(
    templateRoot: string,
    cacheManager: Cache
): Promise<TTemplateSkillBundle[]> {
    let bundles = await cacheManager.get<TTemplateSkillBundle[]>('xpert:template-skill-bundles')
    if (bundles) {
        return bundles
    }

    const directoryPath = path.join(templateRoot, 'skill-packages')
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true }).catch(() => [])
    const bundleCandidates = entries.filter((entry) => entry.isDirectory())
    bundles = (
        await Promise.all(
            bundleCandidates.map((entry) =>
                readTemplateSkillBundle(path.join(directoryPath, entry.name), entry.name, templateRoot)
            )
        )
    ).filter((bundle): bundle is TTemplateSkillBundle => !!bundle)

    await cacheManager.set('xpert:template-skill-bundles', bundles, 10 * 1000)
    return bundles
}

async function readTemplateSkillBundle(
    directoryPath: string,
    directoryName: string,
    templateRoot: string
): Promise<TTemplateSkillBundle | null> {
    const manifestPath = path.join(directoryPath, TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE)
    if (!(await pathExists(manifestPath))) {
        const skillFilePath = path.join(directoryPath, TEMPLATE_SKILL_BUNDLE_SKILL_FILE)
        if (!(await pathExists(skillFilePath))) {
            return null
        }

        const ref = {
            provider: TEMPLATE_SKILL_BUNDLE_LOCAL_PROVIDER,
            repositoryName: TEMPLATE_SKILL_BUNDLE_LOCAL_REPOSITORY,
            skillId: directoryName.trim()
        } satisfies TWorkspaceDefaultSkillRef

        return {
            directoryName,
            directoryPath,
            ref,
            sharedSkillId: buildTemplateSkillBundleSharedSkillId(ref)
        }
    }

    const raw = await readSkillBundleManifest(manifestPath, directoryName, templateRoot)
    if (!isWorkspaceDefaultSkillRef(raw)) {
        logger.warn(`Skipping invalid template skill bundle manifest '${manifestPath}'`)
        return null
    }

    const provider = raw.provider.trim()
    const repositoryName = raw.repositoryName.trim()
    const skillId = raw.skillId.trim()
    if (!provider || !repositoryName || !skillId) {
        logger.warn(`Skipping empty template skill bundle manifest '${manifestPath}'`)
        return null
    }

    const ref = {
        provider,
        repositoryName,
        skillId
    } satisfies TWorkspaceDefaultSkillRef

    return {
        directoryName,
        directoryPath,
        ref,
        sharedSkillId: buildTemplateSkillBundleSharedSkillId(ref)
    }
}

export function buildTemplateSkillBundleSharedSkillId(ref: TWorkspaceDefaultSkillRef) {
    return [
        TEMPLATE_SKILL_BUNDLE_SHARED_PREFIX,
        ref.provider,
        encodeTemplateSkillBundleSegment(ref.repositoryName),
        encodeTemplateSkillBundleSegment(ref.skillId)
    ].join(TEMPLATE_SKILL_BUNDLE_SEPARATOR)
}

export function encodeTemplateSkillBundleSegment(value: string) {
    return encodeURIComponent(value.trim())
}

export function resolveFeaturedSkillIds(skillId: string, repository: ISkillRepository) {
    const skillIds = new Set([skillId])
    const options = repository.options

    if (isObjectValue(options)) {
        const repositoryPath = Reflect.get(options, 'path')
        if (typeof repositoryPath === 'string' && repositoryPath.trim()) {
            const normalizedPath = repositoryPath.trim().replace(/^\/+|\/+$/g, '')
            if (normalizedPath && skillId.startsWith(`${normalizedPath}/`)) {
                skillIds.add(skillId.slice(normalizedPath.length + 1))
            }
        }
    }

    return Array.from(skillIds)
}

export function getSkillRefKey(ref: Pick<ISkillMarketFeaturedRef, 'provider' | 'repositoryName' | 'skillId'>) {
    return `${ref.provider}:${ref.repositoryName}:${ref.skillId}`
}
