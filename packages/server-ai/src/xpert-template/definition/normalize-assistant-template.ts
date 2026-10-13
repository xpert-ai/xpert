import {
    AssistantTemplateDefinition,
    AssistantTemplateMetadata,
    TXpertTemplate,
    templateManifestSchema
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { t } from 'i18next'
import { parseCapabilityTemplateDraft } from '../capabilities/template-draft'
import { parseAssistantTemplateDependencies, assistantTemplateMetadataSchema } from './assistant-template.schema'

/** Common source normalization for plugin delivery and ordinary exported DSLs. Never mutates the input. */
export function normalizeAssistantTemplate(
    template: Pick<TXpertTemplate, 'export_data' | 'manifest' | 'dependencies' | 'pluginName'>
) {
    const draft = parseCapabilityTemplateDraft(template.export_data)
    const raw: unknown = parse(template.export_data)
    const envelope = z
        .object({
            template: assistantTemplateMetadataSchema.optional(),
            memories: z.array(z.object({ prefix: z.string().min(1), value: z.unknown() }).passthrough()).optional()
        })
        .passthrough()
        .parse(raw)
    const inputManifest =
        template.manifest === undefined ? envelope.template?.manifest : templateManifestSchema.parse(template.manifest)
    if (template.manifest && envelope.template?.manifest && !equal(template.manifest, envelope.template.manifest))
        conflict('manifest')
    if (
        template.dependencies &&
        envelope.template?.dependencies &&
        !equal(template.dependencies, envelope.template.dependencies)
    )
        conflict('dependencies')
    let dependencies = parseAssistantTemplateDependencies(
        template.dependencies ?? envelope.template?.dependencies ?? {}
    )
    const legacy = inputManifest?.schemaVersion !== 2 && !envelope.template
    let manifest: AssistantTemplateMetadata['manifest']
    if (inputManifest?.schemaVersion === 1) {
        const { memory, skills, execution, ...rest } = inputManifest
        if (memory && memory.seed !== !!envelope.memories?.length) conflict('memory.seed')
        if (memory?.preferences.length) conflict('memory.preferences')
        if (skills?.length) {
            if (
                dependencies.skills &&
                skills.some(
                    (item) =>
                        !dependencies.skills.some(
                            (dep) =>
                                dep.componentKey === item.componentKey &&
                                (dep.pluginName ?? template.pluginName) === (item.pluginName ?? template.pluginName)
                        )
                )
            )
                conflict('skills')
            dependencies = {
                ...dependencies,
                skills:
                    dependencies.skills ??
                    skills.map((item) => ({ componentKey: item.componentKey, pluginName: item.pluginName }))
            }
        }
        if (execution?.sandbox) {
            if (execution.sandbox !== 'server') conflict('sandbox')
            const sandbox = draft.team.features?.sandbox
            if (sandbox?.enabled === false || sandbox?.provider === 'local-shell-sandbox') conflict('sandbox')
            draft.team.features = { ...draft.team.features, sandbox: { ...sandbox, enabled: true } }
        }
        const requirements = { ...execution }
        delete requirements.sandbox
        manifest = { ...rest, schemaVersion: 2, ...(execution ? { execution: requirements } : {}) }
    } else manifest = inputManifest
    for (const kind of ['skills', 'mcpServers', 'hooks', 'apps', 'toolsets'] as const) {
        const entries = dependencies[kind]
        if (entries?.some((item) => !(item.pluginName ?? template.pluginName))) conflict(`${kind}.pluginName`)
    }
    dependencies = {
        ...dependencies,
        ...Object.fromEntries(
            (['skills', 'mcpServers', 'hooks', 'apps', 'toolsets'] as const)
                .filter((kind) => dependencies[kind])
                .map((kind) => [
                    kind,
                    dependencies[kind].map((item) => ({ ...item, pluginName: item.pluginName ?? template.pluginName }))
                ])
        )
    }
    const metadata: AssistantTemplateMetadata = { schemaVersion: 2, dependencies, ...(manifest ? { manifest } : {}) }
    const definition: AssistantTemplateDefinition = {
        ...draft,
        ...(envelope.memories ? { memories: envelope.memories.map(({ prefix, value }) => ({ prefix, value })) } : {}),
        template: metadata
    }
    return { definition, manifest, dependencies, legacy, exportData: stringify(definition) }
}

function equal(a: unknown, b: unknown): boolean {
    const canonical = (value: unknown) =>
        JSON.stringify(value, (_key, item) =>
            item && typeof item === 'object' && !Array.isArray(item)
                ? Object.fromEntries(
                      Object.keys(item)
                          .sort()
                          .map((key) => [key, Reflect.get(item, key)])
                  )
                : item
        )
    return canonical(a) === canonical(b)
}
function conflict(field: string): never {
    throw new BadRequestException(t('server-ai:Error.AssistantTemplateDeclarationConflict', { field }))
}
