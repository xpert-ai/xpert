import { ChecklistItem, TWorkflowTriggerMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { IWorkflowTriggerStrategy, TWorkflowTriggerParams, WorkflowTriggerStrategy } from '@xpert-ai/plugin-sdk'
import { CronJob } from 'cron'
import { icon, ScheduleTrigger, TScheduleTriggerConfig } from './types'

@Injectable()
@WorkflowTriggerStrategy(ScheduleTrigger)
export class ScheduleTriggerStrategy implements IWorkflowTriggerStrategy<TScheduleTriggerConfig> {
  meta: TWorkflowTriggerMeta = {
    name: ScheduleTrigger,
    label: {
      en_US: 'Schedule Trigger',
      zh_Hans: '定时触发器'
    },
    icon: {
      type: 'svg',
      value: icon,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          title: {
            en_US: 'Enabled',
            zh_Hans: '启用'
          },
          default: true
        },
        cron: {
          type: 'string',
          title: {
            en_US: 'Cron Expression',
            zh_Hans: 'Cron 表达式'
          },
          default: '0 * * * *'
        },
        task: {
          type: 'string',
          title: {
            en_US: 'Task',
            zh_Hans: '任务'
          }
        }
      },
      required: ['enabled', 'cron', 'task']
    }
  }

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  async validate(payload: TWorkflowTriggerParams<TScheduleTriggerConfig>) {
    const { xpertId, node, config } = payload
    const items: ChecklistItem[] = []
    if (!config?.cron) {
      items.push({
        node: node.key,
        ruleCode: 'TRIGGER_PROVIDER_NOT_FOUND',
        field: 'from',
        value: node.key,
        message: {
          en_US: `Trigger node "${node.key}" provider not found`,
          zh_Hans: `触发器节点 "${node.key}" 提供者未找到`
        },
        level: 'error'
      })
    }
    return items
  }

  async publish(payload: TWorkflowTriggerParams<TScheduleTriggerConfig>, callback: (payload: any) => void) {
    const config = payload.config
    const xpertId = payload.xpertId
    const agentKey = payload.agentKey
    const jobName = this.jobName(xpertId)

    // If already exists, delete it and create it again (to avoid duplication)
    try {
      const existingJob = this.schedulerRegistry.getCronJob(jobName)
      existingJob.stop()
      this.schedulerRegistry.deleteCronJob(jobName)
    } catch {
      // Ignore if there is no corresponding task
    }

    if (config.enabled) {
      const job = new CronJob(config.cron, () => {
        if (callback) {
          callback({
            xpertId,
            agentKey,
            from: ScheduleTrigger,
            input: {
              input: config.task
            }
          })
        }
      })

      this.schedulerRegistry.addCronJob(jobName, job)
      job.start()

      console.log(`Scheduled job '${jobName}' with cron expression '${config.cron}'`)
    }
  }

  stop(payload: TWorkflowTriggerParams<TScheduleTriggerConfig>): void {
    const config = payload.config
    const xpertId = payload.xpertId
    const jobName = this.jobName(xpertId)
    try {
      const job = this.schedulerRegistry.getCronJob(jobName)
      job.stop()
      this.schedulerRegistry.deleteCronJob(jobName)

      console.log(`Stopped and deleted scheduled job '${jobName}' with cron expression '${config.cron}'`)
    } catch {
      // Ignore if there is no corresponding task
    }
  }

  jobName(xpertId: string) {
    return `schedule-trigger:${xpertId}`
  }
}
