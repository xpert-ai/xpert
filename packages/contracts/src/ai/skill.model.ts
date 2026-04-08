// Skill types

import { IBasePerTenantAndOrganizationEntityModel } from "../base-entity.model";
import { I18nObject, IconDefinition, letterStartSUID } from "../types";
import { JsonSchemaObjectType } from "./types";
import { IWorkflowNode, WorkflowNodeTypeEnum } from "./xpert-workflow.model";
import { IBasePerWorkspaceEntityModel } from "./xpert-workspace.model";

export type SkillId = string;

export interface ISkillRepositoryIndexStats {
  comments?: number;
  downloads?: number;
  installsAllTime?: number;
  installsCurrent?: number;
  stars?: number;
  versions?: number;
}

export interface ISkillRepositoryIndexPublisher {
  handle?: string;
  displayName?: string;
  name?: string;
  image?: string;
  kind?: string;
}

export interface SkillMetadata {
  name: string;               // Unique name ({namespace}/{name})
  displayName?: I18nObject;   // Display name
  version: string;            // Semver
  summary?: I18nObject;       // 80-char summary
  description?: I18nObject;   // Detailed description
  icon?: IconDefinition;      // Optional skill icon
  tags?: string[];
  author?: { name: string; email?: string; org?: string };
  license?: string;
  visibility: 'private' | 'team' | 'tenant' | 'public';
  categories?: string[];      // e.g. "excel", "branding", "support"
  runtime?: {                 // Optional: executable resource declaration
    entry?: string;           // Script entry (relative path)
    language?: 'js' | 'py' | 'bash';
    permissions?: string[];   // Required permissions (file/network/tools)
    tools?: string[];         // Dependent XpertAI plugins/tools
  };
  mcp?: { servers?: string[] } // Optional: linked MCP servers
}

export interface SkillResourcesIndex {
  // Resource and chunk index, supports summarization/multi-granularity injection
  files: Array<{ path: string; kind: 'script' | 'template' | 'doc' | 'asset'; hash: string; size: number }>;
  chunks?: Array<{ id: string; path: string; summary: string; tokens: number }>;
}

export interface TSkillPackage {
  metadata: SkillMetadata;
  instructions: {              // Structured instruction body
    system?: string;
    developer?: string;
    examples?: Array<{ user: string; assistant: string }>;
    guidelines?: string[];    // Constraints and checklist
  };
  resources?: SkillResourcesIndex;
  abac?: {                     // Access control
    owners: string[]; readers: string[]; writers: string[];
    policies?: Record<string, unknown>; // Extension: attribute-based access control
  };
  signatures?: string[];       // Supply-chain signatures/hashes
  provenance?: Record<string, unknown>;            // Provenance (optional)
}


// shared/types/skill.ts

/**
 * Represents a repository (e.g. anthropics/skills)
 */
export interface ISkillRepository<O = Record<string, unknown>, C = Record<string, unknown>> extends IBasePerTenantAndOrganizationEntityModel {
  name: string;
  provider: string;
  /**
   * Provider credentials such as GitHub tokens
   */
  credentials?: C;
  /**
   * Options configured using the strategy's configSchema
   */
  options?: O;
  lastSyncAt?: Date;
  deletedAt?: Date;
}

/**
 * Skill index produced by repository sync scan (one per skill directory)
 */
export interface ISkillRepositoryIndex extends IBasePerTenantAndOrganizationEntityModel {
  repositoryId: string;
  repository?: ISkillRepository;
  skillPath: string;
  skillId: string;
  name?: string;
  link?: string;
  publisher?: ISkillRepositoryIndexPublisher;
  description?: string;
  license?: string;
  tags?: string[];
  version?: string;
  stats?: ISkillRepositoryIndexStats;
  resources?: Array<Record<string, unknown>>;
  deletedAt?: Date;
}

export interface ISkillMarketFilterOption {
  value: string;
  label: string;
  description?: string;
}

export interface ISkillMarketFilterGroup {
  label: string;
  options: ISkillMarketFilterOption[];
}

export interface ISkillMarketFilterGroups {
  roles: ISkillMarketFilterGroup;
  appTypes: ISkillMarketFilterGroup;
  hot: ISkillMarketFilterGroup;
}

export interface ISkillMarketFeaturedRef {
  provider: string;
  repositoryName: string;
  skillId: string;
  badge?: string;
  title?: string;
  description?: string;
}

export interface ISkillMarketFeaturedSkill extends ISkillMarketFeaturedRef {
  skill: ISkillRepositoryIndex;
}

export interface ISkillMarketConfig {
  featured: ISkillMarketFeaturedSkill[];
  filters: ISkillMarketFilterGroups;
}

/**
 * Installed skill package record (skill.yaml)
 */
export interface ISkillPackage extends IBasePerWorkspaceEntityModel, TSkillPackage {
  skillIndexId?: SkillId; // ISkillRepositoryIndex
  skillIndex?: ISkillRepositoryIndex;
  name?: string;
  visibility: 'private' | 'team' | 'tenant';
  packagePath?: string;
}

/**
 * Skill version (multiple versions can coexist per skill)
 */
export interface ISkillVersion extends IBasePerWorkspaceEntityModel {
  packageId: string;
  version: string;
  metadata: SkillMetadata;
  instructions: TSkillPackage['instructions'];
  installedAt?: string;
}

/**
 * Skill resource file record (scripts/templates/assets)
 */
export interface ISkillResource extends IBasePerWorkspaceEntityModel {
  versionId: string;
  path: string;
  type: 'script' | 'template' | 'asset' | 'doc';
  hash?: string;
  size?: number;
  meta?: Record<string, unknown>;
}

/**
 * Tenant/organization/team/user installation record
 */
export interface ISkillInstallation extends IBasePerTenantAndOrganizationEntityModel {
  versionId: string;
  installedBy: string;
  visibility: 'private' | 'team' | 'tenant';
  targetScope?: string;  // teamId or tenantId
  status: 'pending' | 'installed' | 'failed';
}

/**
 * Detailed logs during skill installation
 */
export interface ISkillInstallLog extends IBasePerTenantAndOrganizationEntityModel {
  installationId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

/**
 * Runtime audit log for skills
 */
export interface ISkillAuditLog extends IBasePerTenantAndOrganizationEntityModel {
  skillId: string;
  versionId: string;
  sessionId: string;
  eventType: string;
  metadata: Record<string, unknown>;
}

export type TSkillSourceMeta = {
  /**
   * Provider name, e.g. github / git / zip / marketplace
   */
  name: string;
  label: I18nObject;
  icon?: IconDefinition;
  description?: I18nObject;
  /**
   * Optional configuration schema for frontend forms
   */
  configSchema?: JsonSchemaObjectType;
  /**
   * Credential schema for source authentication
   */
  credentialSchema?: JsonSchemaObjectType;
}

// ===============================
// Workflow Skill Nodes
// ===============================
export interface IWFNSkill extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.SKILL;

  skills?: string[];
}

export function genXpertSkillKey() {
  return letterStartSUID('Skill_');
}
