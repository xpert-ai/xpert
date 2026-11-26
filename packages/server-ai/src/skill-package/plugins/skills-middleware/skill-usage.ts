import type { ChatSkillUsage, TChatTaskSummaryContribution } from '@xpert-ai/chatkit-types'
import { normalizeChatSkillUsages } from '@xpert-ai/chatkit-types'
import type { ToolRunnableConfig } from '@langchain/core/tools'
import { resolve } from 'node:path'
import type { TRuntimeSkillSource } from '@xpert-ai/contracts'
import type { RuntimeResourceSkillSource } from '../../../agent-plugin/runtime-resource-context'

/** Registry snapshot for a main SKILL.md; the matching path stays server-side. */
export type RegisteredSkillUsage = Pick<ChatSkillUsage, 'skillId' | 'name' | 'version' | 'source'> & {
    path: string
}

/** Structured proof of a successful load, not proof that the model followed the skill. */
type SkillUsageArtifact = { type: 'xpert_skill_usage'; usage: ChatSkillUsage }

/** Derive identity and origin from effective registry metadata, never from file text or display names. */
export function registerSkillUsages(
    skills: readonly {
        id: string
        name: string
        version: string
        workspaceId: string
        path?: string
        runtimePath?: string
        runtimeSource?: TRuntimeSkillSource['type']
    }[],
    resources: readonly RuntimeResourceSkillSource[],
    context: { projectId?: string; xpertId?: string }
): RegisteredSkillUsage[] {
    return skills.flatMap((skill): RegisteredSkillUsage[] => {
        if (!skill.path) return []
        const resource = resources.find((source) => source.id === skill.id && source.runtimePath === skill.runtimePath)
        const source: ChatSkillUsage['source'] =
            resource?.origin ??
            (skill.runtimeSource === 'project' && context.projectId
                ? { type: 'project', id: context.projectId }
                : skill.runtimeSource === 'xpert' && context.xpertId
                  ? { type: 'assistant', id: context.xpertId }
                  : { type: 'workspace', id: skill.workspaceId })
        return [{ path: resolve(skill.path), skillId: skill.id, name: skill.name, version: skill.version, source }]
    })
}

/**
 * Called after a successful read; only matched registered main files receive an observation.
 * Keep instructions as model content and attach provenance through LangChain's artifact channel.
 */
export function skillReadResult(
    content: string,
    skill: RegisteredSkillUsage | undefined,
    config: ToolRunnableConfig
): [string, SkillUsageArtifact | undefined] {
    if (!skill || !config.toolCall?.id) return [content, undefined]
    const executionId = config.configurable?.executionId
    return [
        content,
        {
            type: 'xpert_skill_usage',
            usage: {
                skillId: skill.skillId,
                name: skill.name,
                version: skill.version,
                source: { ...skill.source },
                activation: 'read',
                toolCallId: config.toolCall.id,
                ...(typeof executionId === 'string' && executionId ? { executionId } : {}),
                loadedAt: new Date().toISOString()
            }
        }
    ]
}

/** Project a successful, matching skill read into message metadata without exposing raw tool data. */
export function getSkillUsageSummary({
    toolName,
    toolCallId,
    failed,
    artifact
}: {
    toolName: string | undefined
    toolCallId: string
    failed: boolean
    artifact: unknown
}): TChatTaskSummaryContribution | undefined {
    if (toolName !== 'read_skill_file' || failed) return undefined
    const usage = readSkillUsageArtifact(artifact)
    if (!usage || usage.toolCallId !== toolCallId) return undefined
    return { version: 1, skillUsages: [usage] }
}

/** Parse and allowlist the artifact payload; getSkillUsageSummary also checks the completion context. */
export function readSkillUsageArtifact(artifact: unknown): ChatSkillUsage | undefined {
    if (
        !artifact ||
        typeof artifact !== 'object' ||
        !('type' in artifact) ||
        artifact.type !== 'xpert_skill_usage' ||
        !('usage' in artifact)
    )
        return undefined
    return normalizeChatSkillUsages([artifact.usage])[0]
}
