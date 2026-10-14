import { normalizeAssistantTemplate } from '../../xpert-template/definition/normalize-assistant-template'
import { summarizeAssistantDefinition } from '../../xpert-template/definition/assistant-capability-structure'
import { TemplateManifest, TemplateReadiness, TemplateRequirementCheck, TXpertTemplate } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function requirementCheck(
    kind: TemplateRequirementCheck['kind'],
    key: string,
    status: TemplateRequirementCheck['status'],
    required = true
): TemplateRequirementCheck {
    return { kind, key, status, required, message: t(`server-ai:TemplateRequirement.${status}`, { key }) }
}

export function inspectTemplateManifest(template: TXpertTemplate): {
    manifest?: TemplateManifest
    readiness: TemplateReadiness
    normalized?: ReturnType<typeof normalizeAssistantTemplate>
} {
    const readiness: TemplateReadiness = {
        legacy: template.manifest === undefined,
        canInstall: true,
        checks: [],
        dependencies: []
    }
    let normalized: ReturnType<typeof normalizeAssistantTemplate>
    try {
        normalized = normalizeAssistantTemplate(template)
    } catch {
        readiness.checks.push(requirementCheck('manifest', 'assistant-template', 'incompatible'))
        readiness.canInstall = false
        return { readiness }
    }
    readiness.legacy = normalized.legacy
    readiness.capabilities = summarizeAssistantDefinition(normalized.definition)
    const manifest = normalized.manifest
    if (readiness.capabilities.seedMemoryCount)
        readiness.checks.push(requirementCheck('memory', 'seed-memory', 'ready'))
    if (!manifest) return { readiness, normalized }
    readiness.manifestVersion = manifest.version
    if (manifest.files) {
        readiness.checks.push(requirementCheck('files', 'initial-files', 'ready'))
        readiness.files = {
            scope: manifest.files.scope,
            entries: manifest.files.entries.map((entry) => ({
                kind: entry.kind,
                path: entry.path,
                ...(entry.kind === 'file'
                    ? { version: entry.contentVersion }
                    : entry.kind === 'ledger'
                      ? { version: entry.structureVersion }
                      : {})
            }))
        }
    }
    if (manifest.onboarding)
        readiness.checks.push(
            requirementCheck(
                'onboarding',
                manifest.onboarding.skill,
                'pending-configuration',
                manifest.onboarding.required
            )
        )
    for (const connector of manifest.connectors ?? [])
        readiness.checks.push(
            requirementCheck('connectors', connector.provider, 'pending-configuration', connector.required)
        )
    for (const routine of manifest.routines ?? [])
        readiness.checks.push(
            requirementCheck(
                'routines',
                routine.key,
                routine.trigger === 'schedule' ? 'ready' : 'unsupported',
                routine.required
            )
        )
    for (const capability of manifest.execution?.localCapabilities ?? [])
        readiness.checks.push(requirementCheck('execution', capability, 'unsupported'))
    if (manifest.execution?.offline === 'local-only')
        readiness.checks.push(requirementCheck('execution', 'local-only', 'unsupported'))
    readiness.canInstall = !readiness.checks.some(
        (check) => check.required && !['ready', 'pending-configuration'].includes(check.status)
    )
    return { manifest, readiness, normalized }
}
