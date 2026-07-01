import type { AiFeatureEnum, AnalyticsFeatures, FeatureEnum } from '../../@core/types'

type CloudMenuFeatureKey = AiFeatureEnum | AnalyticsFeatures | FeatureEnum

export interface CloudMenuData {
  translationKey?: string
  permissionKeys?: string[]
  featureKey?: CloudMenuFeatureKey | CloudMenuFeatureKey[]
  activePathPrefixes?: string[]
  inactivePathPrefixes?: string[]
  hideWhenAllChildrenHidden?: boolean
  hide?: () => boolean
  organizationShortcut?: boolean
  urlPrefix?: string
  urlPostfix?: string
  subtitleKey?: string
  subtitleDefault?: string
  badge?: string | number
  onboardingTarget?: string
  [key: string]: unknown
}

export interface CloudMenuItem {
  title: string
  icon?: string
  link?: string
  external?: boolean
  pathMatch?: string
  home?: boolean
  admin?: boolean
  data: CloudMenuData
  children?: CloudMenuItem[]
  hidden?: boolean
  expanded?: boolean
  isActive?: boolean
}
