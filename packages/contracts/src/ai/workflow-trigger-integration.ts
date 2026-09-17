/** Integration requirements declared by a trigger, independent of labels and select URLs. */
export interface TWorkflowTriggerIntegration {
  configField: string
  providers: string[]
}

// Compatibility declarations for released plugins that predate integration metadata.
export const WORKFLOW_TRIGGER_INTEGRATIONS: Readonly<Record<string, TWorkflowTriggerIntegration>> = {
  dingtalk: { configField: 'integrationId', providers: ['dingtalk', 'dingtalk_long'] },
  lark: { configField: 'integrationId', providers: ['lark'] },
  wecom: { configField: 'integrationId', providers: ['wecom', 'wecom_long'] },
  wechat: { configField: 'integrationId', providers: ['wechat'] }
}
