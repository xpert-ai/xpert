import packageJson from '../../package.json'
import type { Route } from '@angular/router'
import type { AiFeatureEnum, FeatureEnum } from '@xpert-ai/contracts'
export const VERSION = packageJson.version as string

export type DeploymentTarget = 'cloud' | 'customer-onprem' | 'local'

export type SettingsExtensionScope = 'tenant-only' | 'organization-only' | 'dual-scope'

export type SettingsExtensionMenuItem = {
  path: string
  label: string
  icon: string
  scopeContext?: SettingsExtensionScope
  data?: {
    permissionKeys?: string[]
    featureKey?: AiFeatureEnum | FeatureEnum | (AiFeatureEnum | FeatureEnum)[]
  }
}

export type SettingsExtensions = {
  menus?: SettingsExtensionMenuItem[]
  routes?: Route[]
}

export function normalizeDeploymentTarget(value: string | undefined, fallback: DeploymentTarget): DeploymentTarget {
  if (!value || value.startsWith('DOCKER_')) {
    return fallback
  }

  if (value === 'cloud' || value === 'customer-onprem' || value === 'local') {
    return value
  }

  return fallback
}

export type IEnvironment = {
  /**
   * Is `production` or `development` evnironment
   */
  production: boolean
  /**
   * Is Demo system
   */
  DEMO: boolean
  pro?: boolean
  version?: string
  deploymentTarget: string

  API_BASE_URL: string
  CHATKIT_FRAME_URL: string
  settingsExtensions?: SettingsExtensions
}
