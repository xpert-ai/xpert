import { derivePluginArtifactNamespace, pluginArtifactTableName } from './artifact-namespace'

describe('plugin artifact namespace helpers', () => {
  it('derives a stable namespace from npm package names', () => {
    expect(derivePluginArtifactNamespace('@xpert-ai/plugin-office-editor')).toBe('office_editor')
    expect(derivePluginArtifactNamespace('@acme/plugin-SalesCRM')).toBe('sales_crm')
    expect(derivePluginArtifactNamespace('plugin-docx-editor')).toBe('docx_editor')
  })

  it('builds plugin table names from validated namespace and key', () => {
    expect(pluginArtifactTableName('office_editor', 'yjs_update')).toBe('plugin_office_editor_yjs_update')
  })

  it('rejects unsafe namespace and table key values', () => {
    expect(() => pluginArtifactTableName('office-editor', 'document')).toThrow(/artifact namespace/)
    expect(() => pluginArtifactTableName('office_editor', 'document.version')).toThrow(/artifact table key/)
  })
})
