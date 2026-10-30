/**
 * AI feature permissions used by endpoint declarations and capability checks.
 * Grants do not imply other permissions or replace resource scope and entitlement checks.
 */
export enum AIPermissionsEnum {
  /**
   * Manage knowledge bases, documents, FAQs and related configuration in the authorized scope.
   * Runtime retrieval through an Assistant uses its resource authorization separately.
   */
  KNOWLEDGEBASE_EDIT = 'KNOWLEDGEBASE_EDIT',
  /**
   * Legacy model-related viewing entry points; marked deprecated in the role editor.
   * Does not authorize provider configuration APIs, which require COPILOT_EDIT.
   */
  COPILOT_VIEW = 'COPILOT_VIEW',
  /** Manage model providers, credentials, models and Copilot configuration in the authorized scope. */
  COPILOT_EDIT = 'COPILOT_EDIT',
  /** Read model usage monitoring data in the authorized scope; does not grant model configuration rights. */
  MODEL_USAGE_MONITOR = 'MODEL_USAGE_MONITOR',
  /** Administer membership plans, user entitlements, quotas and membership records in the authorized scope. */
  MEMBERSHIP_EDIT = 'MEMBERSHIP_EDIT',
  /** Access the current user's membership, billing overview and usage; does not grant membership administration. */
  MEMBERSHIP_USE = 'MEMBERSHIP_USE',
  /** Read administrative model-access requests, grants and audit events without approving or changing grants. */
  MODEL_ACCESS_REQUEST_VIEW = 'MODEL_ACCESS_REQUEST_VIEW',
  /** Approve/reject model-access requests and extend/revoke model grants, subject to scope and workflow checks. */
  MODEL_ACCESS_REQUEST_EDIT = 'MODEL_ACCESS_REQUEST_EDIT',
  /**
   * Use model gateway self-service: catalog, requests, own grants, API keys and call records.
   * Model calls and execution sessions still require valid credentials, model grants and entitlements.
   */
  MODEL_GATEWAY_USE = 'MODEL_GATEWAY_USE',
  /**
   * Administer gateway settings, scoped API keys and call records.
   * Does not imply MODEL_GATEWAY_USE or permission to configure model providers.
   */
  MODEL_GATEWAY_MANAGE = 'MODEL_GATEWAY_MANAGE',
  /** Billing product-management permission contract; billing endpoints must explicitly enforce it. */
  BILLING_PRODUCT_EDIT = 'BILLING_PRODUCT_EDIT',
  /** Refund permission contract; billing endpoints must enforce it alongside refund eligibility checks. */
  BILLING_REFUND = 'BILLING_REFUND',
  /** Payment-provider configuration permission contract; payment endpoints must explicitly enforce it. */
  PAYMENT_PROVIDER_EDIT = 'PAYMENT_PROVIDER_EDIT',
  /**
   * Read authorized authoring resources; does not unlock the complete Studio configuration UI.
   * Published Assistant runtime access is separate.
   */
  XPERT_VIEW = 'XPERT_VIEW',
  /**
   * Manage tenant/shared authoring workspaces within the current scope.
   * Resource authorization and action permissions such as XPERT_EDIT still apply.
   */
  XPERT_WORKSPACE_MANAGE = 'XPERT_WORKSPACE_MANAGE',
  /**
   * Create, edit or publish Assistants and access authoring configuration APIs.
   * Requires workspace authorization; workspace reading and chat use have separate permissions.
   */
  XPERT_EDIT = 'XPERT_EDIT',
  /**
   * Use assigned applications and access their delivery status/retry operations.
   * Does not grant installation or authoring; chat also requires CHAT_VIEW and Assistant access.
   */
  APPLICATION_USE = 'APPLICATION_USE',
  /**
   * Initialize or update plugin applications and operate managed application deliveries.
   * Organization membership and installation/service scope restrictions still apply.
   */
  APPLICATION_INSTALL = 'APPLICATION_INSTALL',
  /** Read projects and their business views subject to project membership and resource authorization. */
  XPERT_PROJECT_VIEW = 'XPERT_PROJECT_VIEW',
  /** Create or duplicate projects; project type and Assistant access checks still apply. */
  XPERT_PROJECT_CREATE = 'XPERT_PROJECT_CREATE',
  /** Edit project content and perform contribution actions when the project's resource policy permits them. */
  XPERT_PROJECT_EDIT = 'XPERT_PROJECT_EDIT',
  /** Manage projects, membership and pipeline configuration subject to project management authorization. */
  XPERT_PROJECT_MANAGE = 'XPERT_PROJECT_MANAGE',
  /**
   * Run authorized published Assistants and use chat, conversation and runtime business APIs.
   * This includes execution and authorized writes, not just viewing; it grants no authoring access.
   */
  CHAT_VIEW = 'CHAT_VIEW',
  /** Read Agent Evolution dashboards, learning records, evaluations and change history in the authorized scope. */
  EVOLUTION_VIEW = 'EVOLUTION_VIEW',
  /** Manage Agent Evolution proposals, evaluations, approvals and releases, subject to governance checks. */
  EVOLUTION_MANAGE = 'EVOLUTION_MANAGE'
}
