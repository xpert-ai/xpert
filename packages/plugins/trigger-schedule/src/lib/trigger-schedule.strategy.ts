import { ChecklistItem } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { IWorkflowTriggerStrategy, TWorkflowTriggerParams, WorkflowTriggerStrategy } from '@xpert-ai/plugin-sdk'
import { CronJob } from 'cron'
import { ScheduleTrigger, TScheduleTriggerConfig } from './types'

@Injectable()
@WorkflowTriggerStrategy(ScheduleTrigger)
export class ScheduleTriggerStrategy implements IWorkflowTriggerStrategy<TScheduleTriggerConfig> {
  meta = {
    name: ScheduleTrigger,
    label: {
      en_US: 'Schedule Trigger',
      zh_Hans: '定时触发器'
    },
    icon: {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6177 5.9681L19.0711 4.51472L20.4853 5.92893L19.0319 7.38231C20.2635 8.92199 21 10.875 21 13C21 17.9706 16.9706 22 12 22C7.02944 22 3 17.9706 3 13C3 8.02944 7.02944 4 12 4C14.125 4 16.078 4.73647 17.6177 5.9681ZM12 20C15.866 20 19 16.866 19 13C19 9.13401 15.866 6 12 6C8.13401 6 5 9.13401 5 13C5 16.866 8.13401 20 12 20ZM11 8H13V14H11V8ZM8 1H16V3H8V1Z"></path></svg>',
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
    if (!config.cron) {
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
