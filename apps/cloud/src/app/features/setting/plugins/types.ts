import { IconDefinition } from '@cloud/app/@core'

export type TPlugin = {
  name: string
  displayName: string
  description: string
  version: string
  category: string
  icon: IconDefinition
  author: {
    name: string
    url: string
  }
  source?: {
    url: string
    type: 'marketplace' | 'github' | 'npm' | 'website' | 'other'
  }
  keywords?: string[]
}

export type TPluginWithDownloads = TPlugin & {
  downloads?: {
    lastWeek?: number
    lastMonth?: number
    lastYear?: number
  }
}
