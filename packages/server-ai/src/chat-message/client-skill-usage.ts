import type { IChatMessage, TChatTaskSummaryContribution } from '@xpert-ai/contracts'

/** Public message mutations cannot attest that the runtime loaded a skill. */
export function stripClientSkillSummary(summary: TChatTaskSummaryContribution): TChatTaskSummaryContribution {
    if (!summary || typeof summary !== 'object') return summary
    const { skillUsages: _untrusted, ...rest } = summary
    return rest
}

/** Component summaries also feed aggregation, so clearing only the root summary would allow forgery. */
export function stripClientSkillContent(content: IChatMessage['content']): IChatMessage['content'] {
    if (!Array.isArray(content)) return content
    return content.map((part) => {
        if (part?.type !== 'component' || !part.data || typeof part.data !== 'object') return part
        return {
            ...part,
            data: {
                ...part.data,
                ...(part.data.taskSummary !== undefined
                    ? { taskSummary: stripClientSkillSummary(part.data.taskSummary) }
                    : {})
            }
        }
    })
}
