export interface PluginLibraryItem {
  id: string
  name: string
  description: string
  icon: string | null
  version: string
  scope: 'tenant' | 'organization'
  status: 'available' | 'configuration_required' | 'disabled'
  components: { kind: 'skill' | 'mcp' | 'middleware' | 'external_xpert'; name: string }[]
}

export interface PluginLibrary {
  items: PluginLibraryItem[]
}
