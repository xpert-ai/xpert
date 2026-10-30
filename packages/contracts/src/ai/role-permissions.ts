export enum AIPermissionsEnum {
  /**
   * Create or edit Knowledgebase in organization.
   */
  KNOWLEDGEBASE_EDIT = 'KNOWLEDGEBASE_EDIT',
  COPILOT_VIEW = 'COPILOT_VIEW',
  COPILOT_EDIT = 'COPILOT_EDIT',
  MODEL_USAGE_MONITOR = 'MODEL_USAGE_MONITOR',
  MEMBERSHIP_EDIT = 'MEMBERSHIP_EDIT',
  MEMBERSHIP_USE = 'MEMBERSHIP_USE',
  MODEL_ACCESS_REQUEST_VIEW = 'MODEL_ACCESS_REQUEST_VIEW',
  MODEL_ACCESS_REQUEST_EDIT = 'MODEL_ACCESS_REQUEST_EDIT',
  MODEL_GATEWAY_USE = 'MODEL_GATEWAY_USE',
  MODEL_GATEWAY_MANAGE = 'MODEL_GATEWAY_MANAGE',
  BILLING_PRODUCT_EDIT = 'BILLING_PRODUCT_EDIT',
  BILLING_REFUND = 'BILLING_REFUND',
  PAYMENT_PROVIDER_EDIT = 'PAYMENT_PROVIDER_EDIT',
  /**
   * Read authorized authoring resources. Published Assistant runtime access is separate.
   */
  XPERT_VIEW = 'XPERT_VIEW',
  /**
   * Manage tenant/shared authoring workspaces within the current scope.
   * Resource authorization and action permissions such as XPERT_EDIT still apply.
   */
  XPERT_WORKSPACE_MANAGE = 'XPERT_WORKSPACE_MANAGE',
  /** Create, edit or publish Assistants subject to authoring workspace authorization. */
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
  XPERT_PROJECT_VIEW = 'XPERT_PROJECT_VIEW',
  XPERT_PROJECT_CREATE = 'XPERT_PROJECT_CREATE',
  XPERT_PROJECT_EDIT = 'XPERT_PROJECT_EDIT',
  XPERT_PROJECT_MANAGE = 'XPERT_PROJECT_MANAGE',
  CHAT_VIEW = 'CHAT_VIEW',
  EVOLUTION_VIEW = 'EVOLUTION_VIEW',
  EVOLUTION_MANAGE = 'EVOLUTION_MANAGE'
}
