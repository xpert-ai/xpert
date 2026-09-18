import { I18nObject, JsonSchemaObjectType } from "@xpert-ai/contracts"

export type WorkflowTriggerProviderOption = {
  name: string
  label: I18nObject
  configSchema?: JsonSchemaObjectType
}

export const CHAT_WORKFLOW_TRIGGER_PROVIDER: WorkflowTriggerProviderOption = {
  name: 'chat',
  label: {
    en_US: 'Chat',
    zh_Hans: '聊天'
  }
}
