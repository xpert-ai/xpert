export interface PluginLibraryItem {
  id: string
  name: string
  description: string
  icon: string | null
  version: string
  scope: 'tenant' | 'organization'
  status: 'available' | 'configuration_required' | 'disabled'
  components: InstalledAgentPlugin['components']
}

export interface PluginLibrary {
  items: PluginLibraryItem[]
}
import type { InstalledAgentPlugin } from '@xpert-ai/contracts'
