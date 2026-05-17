import { SkillCreatorSkillMetadata, SkillCreatorSkillRef, SkillCreatorToolResult } from './skill-creator-cqrs'
import { ISkillPackage } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SkillPackageService } from '../skill-package.service'

export function buildSkillCreatorMetadata(skill: ISkillPackage): SkillCreatorSkillMetadata {
    const metadata = skill.metadata as (ISkillPackage['metadata'] & { skillMdPath?: string; skillPath?: string }) | null
    const name = metadata?.name ?? pickI18nText(skill.name) ?? null
    const displayName = pickI18nText(metadata?.displayName) ?? null
    const description =
        pickI18nText(metadata?.description) ?? pickI18nText(metadata?.summary) ?? skill.skillIndex?.description ?? null

    return {
        id: skill.id ?? null,
        workspaceId: skill.workspaceId ?? null,
        name,
        displayName,
        description,
        packagePath: skill.packagePath ?? metadata?.skillPath ?? null,
        skillMdPath: metadata?.skillMdPath ?? null,
        visibility: skill.visibility ?? null,
        version: metadata?.version ?? null
    }
}

export async function resolveWorkspaceAuthoredSkill(
    skillPackageService: SkillPackageService,
    workspaceId: string,
    skillRef: SkillCreatorSkillRef
): Promise<SkillCreatorToolResult & { skillPackage?: ISkillPackage }> {
    const normalizedRef = normalizeSkillRef(skillRef)
    if (!Object.keys(normalizedRef).length) {
        return {
            status: 'rejected',
            summary: 'skillRef must include id, name, displayName, or packagePath.',
            candidates: []
        }
    }

    const skills = await listWorkspaceSkills(skillPackageService, workspaceId)
    const matched = skills.filter((skill) => matchesSkillRef(skill, normalizedRef))
    const candidates = matched.map(buildSkillCreatorMetadata)

    if (!matched.length) {
        return {
            status: 'not_found',
            summary: 'No workspace skill package matched the provided skillRef.',
            candidates: []
        }
    }

    if (matched.length > 1) {
        return {
            status: 'ambiguous',
            summary: `Found ${matched.length} workspace skill packages matching the provided skillRef. Choose one more specific ref before editing.`,
            candidates
        }
    }

    const [skillPackage] = matched
    if (skillPackage.skillIndexId) {
        return {
            status: 'rejected',
            summary: 'Only workspace-authored skills can be edited by skillCreatorMiddleware.',
            skill: buildSkillCreatorMetadata(skillPackage),
            candidates
        }
    }

    return {
        status: 'found',
        summary: `Found workspace skill "${buildSkillCreatorMetadata(skillPackage).displayName ?? buildSkillCreatorMetadata(skillPackage).name ?? skillPackage.id}".`,
        skill: buildSkillCreatorMetadata(skillPackage),
        candidates,
        skillPackage
    }
}

async function listWorkspaceSkills(skillPackageService: SkillPackageService, workspaceId: string) {
    const result = await skillPackageService.getAllByWorkspace(
        workspaceId,
        {
            relations: ['skillIndex', 'skillIndex.repository']
        } as any,
        false,
        RequestContext.currentUser()
    )

    return (result.items ?? []) as ISkillPackage[]
}

function normalizeSkillRef(skillRef: SkillCreatorSkillRef) {
    return Object.fromEntries(
        Object.entries(skillRef ?? {})
            .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])
            .filter(([, value]) => Boolean(value))
    ) as SkillCreatorSkillRef
}

function matchesSkillRef(skill: ISkillPackage, skillRef: SkillCreatorSkillRef) {
    const metadata = buildSkillCreatorMetadata(skill)
    const matchers: Array<[keyof SkillCreatorSkillRef, string | null | undefined]> = [
        ['id', metadata.id],
        ['name', metadata.name],
        ['displayName', metadata.displayName],
        ['packagePath', normalizePackagePath(metadata.packagePath)]
    ]

    return matchers.every(([key, actual]) => {
        const expected = skillRef[key]
        if (!expected) {
            return true
        }
        const normalizedExpected = key === 'packagePath' ? normalizePackagePath(expected) : expected
        return actual === normalizedExpected
    })
}

function normalizePackagePath(value?: string | null) {
    return value?.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '') || null
}

function pickI18nText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
        return value.trim()
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }
    const candidate = value as Record<string, unknown>
    for (const key of ['en_US', 'zh_Hans', 'zh_CN']) {
        const text = candidate[key]
        if (typeof text === 'string' && text.trim()) {
            return text.trim()
        }
    }
    for (const text of Object.values(candidate)) {
        if (typeof text === 'string' && text.trim()) {
            return text.trim()
        }
    }
    return null
}
