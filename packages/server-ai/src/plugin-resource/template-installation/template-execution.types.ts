import type { AssistantTemplateDefinition, TemplateDependencyLock } from '@xpert-ai/contracts'
import type { RuntimeResourceSkillSource } from '../../agent-plugin/runtime-resource-context'

export interface PreparedTemplateExecution {
    draft: AssistantTemplateDefinition
    locks: TemplateDependencyLock[]
    skills: { [agentKey: string]: RuntimeResourceSkillSource[] }
}
