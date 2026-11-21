import { projectTaskConfigurationSchema, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import { label } from './constants'

const taskSettings = projectTaskConfigurationSchema()
export const codingProjectConfigurationSchema: JsonSchemaObjectType = {
  ...taskSettings,
  properties: {
    ...taskSettings.properties,
    serviceLifecycle: {
      type: 'string',
      enum: ['coordinator', 'task'],
      default: 'coordinator',
      title: label('Development service lifecycle', '开发服务生命周期'),
      description: label(
        'Coordinator: retain services across implementation, review, rework and pending human acceptance; the main Assistant delegates final shutdown. Task: stop task-owned services at task end. Coding CLI operates services locally in either mode.',
        'coordinator：开发、评审、返工及等待人工验收期间保留服务，由主 Assistant 安排最终停服。task：任务结束时停止该任务专属服务。两种模式均由 Coding CLI 本地操作服务。'
      )
    },
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
