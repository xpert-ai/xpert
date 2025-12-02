// Skill types

import { IBasePerTenantAndOrganizationEntityModel } from "../base-entity.model";
import { I18nObject, IconDefinition, letterStartSUID } from "../types";
import { JsonSchemaObjectType } from "./types";
import { IWorkflowNode, WorkflowNodeTypeEnum } from "./xpert-workflow.model";
import { IBasePerWorkspaceEntityModel } from "./xpert-workspace.model";

export type SkillId = string;

export interface SkillMetadata {
  name: string;               // 唯一名（{namespace}/{name}）
  displayName?: I18nObject;         // 展示名
  version: string;            // 语义化版本
  summary?: I18nObject;             // 80 字摘要
  description?: I18nObject;         // 详细说明
  tags?: string[];
  author?: { name: string; email?: string; org?: string };
  license?: string;
  visibility: 'private' | 'team' | 'tenant' | 'public';
  categories?: string[];      // 如 "excel", "branding", "support"
  runtime?: {                 // 可选：可执行资源声明
    entry?: string;           // 脚本入口（相对路径）
    language?: 'js' | 'py' | 'bash';
    permissions?: string[];   // 运行所需权限（文件/网络/工具）
    tools?: string[];         // 依赖的 XpertAI 插件/工具名
  };
  mcp?: { servers?: string[] } // 可选：关联 MCP 服务器
}

export interface SkillResourcesIndex {
  // 资源与片段索引，支持摘要/多粒度注入
  files: Array<{ path: string; kind: 'script' | 'template' | 'doc' | 'asset'; hash: string; size: number }>;
  chunks?: Array<{ id: string; path: string; summary: string; tokens: number }>;
}

export interface TSkillPackage {
  metadata: SkillMetadata;
  instructions: {              // 结构化的指令体
    system?: string;
    developer?: string;
    examples?: Array<{ user: string; assistant: string }>;
    guidelines?: string[];    // 约束与检查清单
  };
  resources?: SkillResourcesIndex;
  abac?: {                     // 访问控制
    owners: string[]; readers: string[]; writers: string[];
    policies?: any;           // 扩展：属性基访问控制
  };
  signatures?: string[];       // 供应链签名/哈希
  provenance?: any;            // 来源证明（可选）
}


// shared/types/skill.ts

/**
 * 表示一个仓库（如 anthropics/skills）
 */
export interface ISkillRepository<O = Record<string, any>, C = Record<string, any>> extends IBasePerTenantAndOrganizationEntityModel {
  name: string;
  provider: string
  /**
   * Provider credentials such as GitHub tokens
   */
  credentials?: C;
  /**
   * Options configured using the strategy's configSchema
   */
  options?: O
  lastSyncAt?: string;
  deletedAt?: Date
}

/**
 * 仓库同步扫描得到的技能索引（每个技能目录一条）
 */
export interface ISkillRepositoryIndex extends IBasePerTenantAndOrganizationEntityModel {
  repositoryId: string;
  repository?: ISkillRepository;
  skillPath: string;
  skillId: string;
  name?: string;
  description?: string;
  license?: string;
  tags?: string[];
  version?: string;
  resources?: any[];
  deletedAt?: Date
}

/**
 * 安装后的技能包主记录（skill.yaml）
 */
export interface ISkillPackage extends IBasePerWorkspaceEntityModel, TSkillPackage {
  skillIndexId: SkillId; // ISkillRepositoryIndex
  skillIndex?: ISkillRepositoryIndex;
  name?: any;
  visibility: 'private' | 'team' | 'tenant';
}

/**
 * 技能的版本（1个 Skill 多版本共存）
 */
export interface ISkillVersion extends IBasePerWorkspaceEntityModel {
  packageId: string;
  version: string;
  metadata: any;
  instructions: any;
  installedAt?: string;
}

/**
 * 技能资源文件（scripts/templates/assets）记录
 */
export interface ISkillResource extends IBasePerWorkspaceEntityModel {
  versionId: string;
  path: string;
  type: 'script' | 'template' | 'asset' | 'doc';
  hash?: string;
  size?: number;
  meta?: any;
}

/**
 * 租户/组织/团队/用户安装行为记录
 */
export interface ISkillInstallation extends IBasePerTenantAndOrganizationEntityModel {
  versionId: string;
  installedBy: string;
  visibility: 'private' | 'team' | 'tenant';
  targetScope?: string;  // teamId or tenantId
  status: 'pending' | 'installed' | 'failed';
}

/**
 * 技能安装过程中详细日志
 */
export interface ISkillInstallLog extends IBasePerTenantAndOrganizationEntityModel {
  installationId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

/**
 * 技能运行期审计日志
 */
export interface ISkillAuditLog extends IBasePerTenantAndOrganizationEntityModel {
  skillId: string;
  versionId: string;
  sessionId: string;
  eventType: string;
  metadata: any;
}

export type TSkillSourceMeta = {
  /**
   * Provider name, e.g. github / git / zip / marketplace
   */
  name: string
  label: I18nObject
  icon?: IconDefinition
  description?: I18nObject
  /**
   * Optional configuration schema for frontend forms
   */
  configSchema?: JsonSchemaObjectType
  /**
   * Credential schema for source authentication
   */
  credentialSchema?: JsonSchemaObjectType
}

// ===============================
// Workflow Skill Nodes
// ===============================
export interface IWFNSkill extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.SKILL

  skills?: string[]
}

export function genXpertSkillKey() {
  return letterStartSUID('Skill_')
}
