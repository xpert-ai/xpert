import { TPlugin } from '@cloud/app/@shared/plugins'

export type TPluginWithDownloads = TPlugin & {
  downloads?: {
    lastWeek?: number
    lastMonth?: number
    lastYear?: number
  }
}
