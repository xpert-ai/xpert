import { IconDefinition } from './types'

export type PluginName = string;

export interface PluginMeta {
  name: PluginName
  version: string
  icon?: IconDefinition
  category: 'set' | 'doc-source' | 'agent' | 'tools' | 'model' | 'vlm' | 'vector-store' | 'integration' | 'datasource'
  displayName: string
  description: string
  keywords?: string[]
  author: string
  homepage?: string
}
