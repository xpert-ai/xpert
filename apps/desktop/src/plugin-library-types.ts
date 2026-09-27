export interface PluginLibraryItem {
  id: string
  name: string
  description: string
  icon: string | null
  version: string
  status: 'available' | 'not_published' | 'disabled'
  components: { kind: 'skill' | 'mcp' | 'middleware' | 'external_xpert'; name: string }[]
  expertReferences: string[]
}

export interface PluginLibrary {
  workspaceId: string | null
  workspaces: { id: string; name: string }[]
  experts: { id: string; name: string }[]
  items: PluginLibraryItem[]
}
