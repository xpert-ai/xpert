import type { AssistantTemplateOverview, TXpertTemplate, IXpertAgent } from '@xpert-ai/contracts'
import { normalizeAssistantTemplate } from './normalize-assistant-template'
import { summarizeAssistantDefinition } from './assistant-capability-structure'

/** Whitelist the catalog introduction; never serialize the DSL or arbitrary memory/configuration objects. */
export function describeAssistantTemplate(template: TXpertTemplate): AssistantTemplateOverview {
    const { definition, manifest, dependencies } = normalizeAssistantTemplate(template)
    const summary = summarizeAssistantDefinition(definition)
    const primary = definition.nodes.find((node) => node.type === 'agent' && node.key === definition.team.agent?.key)
    const instructions = primary?.type === 'agent' ? (primary.entity as IXpertAgent).prompt : ''
    const integrations: AssistantTemplateOverview['integrations'] = (manifest?.connectors ?? []).map((item) => ({
        key: item.key,
        kind: 'connector',
        label: item.provider,
        description: item.purpose,
        required: item.required,
        permissions: item.permissions
    }))
    for (const item of dependencies.mcpServers ?? [])
        integrations.push({
            key: `mcp:${item.pluginName}:${item.componentKey}`,
            kind: 'mcp',
            label: item.componentKey,
            description: '',
            required: true,
            permissions: []
        })
    for (const item of dependencies.apps ?? [])
        integrations.push({
            key: `app:${item.pluginName}:${item.componentKey}`,
            kind: 'app',
            label: item.componentKey,
            description: '',
            required: true,
            permissions: []
        })
    for (const item of dependencies.toolsets ?? [])
        integrations.push({
            key: `toolset:${item.templateNodeKey}`,
            kind: 'toolset',
            label: item.instanceName || item.provider,
            description: '',
            required: true,
            permissions: []
        })
    return {
        id: template.id,
        title: template.title || template.name,
        description: template.description || '',
        publisher: template.copyright || template.pluginDisplayName || template.pluginName || 'Xpert',
        version: manifest?.version || definition.team.version,
        instructions: typeof instructions === 'string' ? instructions : '',
        memories: (definition.memories ?? []).map(({ prefix, value }) => {
            if (typeof value === 'string') return { title: prefix, content: value }
            if (
                value &&
                typeof value === 'object' &&
                'question' in value &&
                'answer' in value &&
                typeof value.question === 'string' &&
                typeof value.answer === 'string'
            )
                return { title: value.question, content: value.answer }
            return { title: prefix }
        }),
        skills: summary.skills,
        agents: summary.agents,
        ...(manifest?.onboarding
            ? {
                  onboarding: {
                      skill: manifest.onboarding.skill,
                      required: manifest.onboarding.required,
                      preferences: manifest.onboarding.preferences,
                      completionCriteria: manifest.onboarding.completionCriteria
                  }
              }
            : {}),
        routines: (manifest?.routines ?? []).map((item) => ({
            key: item.key,
            required: item.required,
            trigger: item.trigger,
            expression: item.expression,
            timezone: item.timezone,
            skill: item.skill,
            output: item.output,
            enabled: false
        })),
        integrations,
        ...(manifest?.files
            ? { files: { scope: manifest.files.scope, paths: manifest.files.entries.map((file) => file.path) } }
            : {}),
        ...(definition.team.options?.operationPolicy
            ? {
                  operationPolicy: {
                      default: definition.team.options.operationPolicy.default,
                      rules: definition.team.options.operationPolicy.rules.map((rule) => ({
                          tool: rule.tool,
                          decision: rule.decision,
                          ...(rule.reason ? { reason: rule.reason } : {})
                      }))
                  }
              }
            : {}),
        ...(template.application
            ? { application: { appName: template.application.appName, pluginName: template.application.pluginName } }
            : {})
    }
}
