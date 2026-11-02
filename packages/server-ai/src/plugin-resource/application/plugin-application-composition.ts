import type { PluginApplicationCompositionItem, PluginTemplateApplicationSummary } from '@xpert-ai/contracts'

/** Membership, not marketing copy or a plugin-wide inventory. */
export function applicationComposition(
    application: PluginTemplateApplicationSummary
): PluginApplicationCompositionItem[] {
    const { config } = application
    return [
        {
            key: 'assistant:primary',
            kind: 'assistant',
            role: 'primary',
            templateKey: application.assistantTemplateKey,
            title: application.displayName
        },
        ...(config.assistantSuite?.roles ?? []).map(
            (role): PluginApplicationCompositionItem => ({
                key: `assistant:role:${role.key}`,
                kind: 'assistant',
                role: 'specialist',
                templateKey: role.templateKey,
                title: role.title ?? role.key
            })
        ),
        ...(config.assistantSuite?.standaloneAssistants ?? []).map(
            (role): PluginApplicationCompositionItem => ({
                key: `assistant:standalone:${role.key}`,
                kind: 'assistant',
                role: 'standalone',
                templateKey: role.templateKey,
                title: role.title ?? role.key
            })
        ),
        { key: 'workspace', kind: 'workspace', title: config.workspace.name },
        ...(config.knowledgebases ?? []).map(
            (kb): PluginApplicationCompositionItem => ({
                key: `knowledgebase:${kb.key}`,
                kind: 'knowledgebase',
                title: kb.name
            })
        )
    ]
}
