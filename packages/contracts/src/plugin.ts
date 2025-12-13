import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model';
import { IconDefinition } from './types'

export type PluginName = string;

export interface PluginMeta {
  name: PluginName
  version: string
  icon?: IconDefinition
  category: 'set' | 'doc-source' | 'agent' | 'tools' | 'model' | 'vlm' | 'vector-store' | 'integration' | 'datasource' | 'database' | 'middleware'
  displayName: string
  description: string
  keywords?: string[]
  author: string
  homepage?: string
}

export interface IPlugin extends IBasePerTenantAndOrganizationEntityModel {
  pluginName: string;
  packageName: string;
  version?: string;
  source?: "marketplace" | "local" | "git" | "url";
  config: Record<string, any>;
}