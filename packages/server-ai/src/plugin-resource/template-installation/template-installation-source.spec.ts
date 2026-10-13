import { installationHash, templateInstallationSourceHash } from './template-installation-source'

describe('installation intent and source fingerprints', () => {
    it('ignores JSON object property order, including nested model options', () => {
        expect(installationHash({ publish: false, basic: { options: { temperature: 0, size: 100 } } })).toBe(
            installationHash({ basic: { options: { size: 100, temperature: 0 } }, publish: false })
        )
    })
    it('binds values and array order', () => {
        expect(installationHash({ publish: false })).not.toBe(installationHash({ publish: true }))
        expect(installationHash(['a', 'b'])).not.toBe(installationHash(['b', 'a']))
    })
    it('binds DSL, plugin version and workspace initialization content', () => {
        const template = { id: 'template', export_data: 'dsl', pluginVersion: '1' }
        const hash = templateInstallationSourceHash(template)
        expect(templateInstallationSourceHash({ ...template, export_data: 'changed' })).not.toBe(hash)
        expect(templateInstallationSourceHash({ ...template, pluginVersion: '2' })).not.toBe(hash)
        expect(templateInstallationSourceHash({ ...template, promptWorkflows: [] })).not.toBe(hash)
    })
})
