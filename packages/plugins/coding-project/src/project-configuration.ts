import { projectTaskConfigurationSchema, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import { label } from './constants'

const taskSettings = projectTaskConfigurationSchema(7200)
export const codingProjectConfigurationSchema: JsonSchemaObjectType = {
  ...taskSettings,
  properties: {
    ...taskSettings.properties,
    deliveryMode: {
      type: 'string',
      enum: ['local', 'release'],
      default: 'local',
      title: label('Default delivery workflow', '默认交付流程'),
      description: label(
        'local: develop and independently accept inside the Computer. release: also approve, deploy to an authorized target and push Git. Applies to new deliveries only.',
        'local：云电脑内开发、部署与独立验收。release：另含人工审批、授权目标部署及 Git 推送。仅影响新流程。'
      )
    }
  }
}
