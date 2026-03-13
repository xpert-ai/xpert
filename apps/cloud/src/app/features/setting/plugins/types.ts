import { IPluginDescriptor } from '@metad/cloud/state'
import { TPlugin } from '@cloud/app/@shared/plugins'

export type TPluginWithDownloads = TPlugin & {
  downloads?: {
    lastWeek?: number
    lastMonth?: number
    lastYear?: number
  }
}

export type TInstalledPlugin = IPluginDescriptor & {
  __trackId?: string
}
