import { JsonSchemaObjectType, TWorkflowTriggerMeta } from '../../../@core'

export type WorkflowTriggerProviderOption = Pick<TWorkflowTriggerMeta, 'name' | 'label'> & {
  configSchema?: JsonSchemaObjectType | null
}

export const CHAT_WORKFLOW_TRIGGER_PROVIDER: WorkflowTriggerProviderOption = {
  name: 'chat',
  label: {
    en_US: 'Chat',
    zh_Hans: '聊天'
  }
}
