import { TemplateUpgradeSection } from '@xpert-ai/contracts'
import { parseCapabilityTemplateDraft } from '../capabilities/template-draft'
import { fingerprint, portableTemplate, PortableTemplate } from './portable-template'

export const portableSections: TemplateUpgradeSection[] = ['presentation', 'instructions', 'runtime', 'definition']
export function sectionHashes(content: PortableTemplate) {
    return Object.fromEntries(portableSections.map((key) => [key, fingerprint(content[key])]))
}
export function templateBaseline(dsl: string) {
    try {
        const projection = portableTemplate(parseCapabilityTemplateDraft(dsl))
        return projection.blocked.length ? undefined : sectionHashes(projection.content)
    } catch {
        return undefined
    }
}
