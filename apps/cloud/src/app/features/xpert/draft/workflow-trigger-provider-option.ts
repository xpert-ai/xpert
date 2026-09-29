import { JsonSchemaObjectType, TWorkflowTriggerMeta } from '@xpert-ai/contracts'

export type WorkflowTriggerProviderOption = Pick<TWorkflowTriggerMeta, 'name' | 'label' | 'quickConnect'> & {
  configSchema?: JsonSchemaObjectType
}

export const CHAT_WORKFLOW_TRIGGER_PROVIDER: WorkflowTriggerProviderOption = {
  name: 'chat',
  label: {
    en_US: 'Chat',
    zh_Hans: '聊天'
  }
}
