import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatConversation } from './chat.model'
import { IXpert } from './xpert.model'

export enum XpertTaskStatus {
  PAUSED = 'paused',
  ARCHIVED = 'archived',
  SCHEDULED = 'scheduled',
}

/**
 * Tools for Xpert
 */
export interface IXpertTask extends IBasePerTenantAndOrganizationEntityModel, XpertTaskType {}

export type XpertTaskType = {
  name?: string
  schedule?: string
  options?: TTaskOptions
  timeZone?: string
  prompt?: string
  status?: XpertTaskStatus

  xpert?: IXpert
  xpertId?: string
  agentKey?: string
  // One to many
  conversations?: IChatConversation[]

  // Temporary properties
  job?: any
  scheduleDescription?: string
  executionCount?: number
  errorCount?: number
  successCount?: number
}

export enum TaskFrequency {
  Once = 'Once',
  Daily = 'Daily',
  Weekly = 'Weekly',
  Monthly = 'Monthly',
  Yearly = 'Yearly',
}

export type TTaskOptions = {
  frequency: TaskFrequency
  time: string; // 'HH:mm'
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  month?: number; // 1-12
  date?: string; // 'YYYY-MM-DD'
}

export function generateCronExpression(schedule: TTaskOptions): string {
  const [hourStr, minuteStr] = schedule.time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  switch (schedule.frequency) {
    case 'Once': {
      if (!schedule.date) throw new Error('Date is required for Once schedule');
      const date = new Date(schedule.date);
      return `${minute} ${hour} ${date.getDate()} ${date.getMonth() + 1} *`;
    }
    case 'Daily':
      return `${minute} ${hour} * * *`;

    case 'Weekly':
      if (schedule.dayOfWeek === undefined) throw new Error('dayOfWeek is required for Weekly schedule');
      return `${minute} ${hour} * * ${schedule.dayOfWeek}`;

    case 'Monthly':
      if (!schedule.dayOfMonth) throw new Error('dayOfMonth is required for Monthly schedule');
      return `${minute} ${hour} ${schedule.dayOfMonth} * *`;

    case 'Yearly':
      if (!schedule.dayOfMonth || !schedule.month) throw new Error('dayOfMonth and month are required for Yearly schedule');
      return `${minute} ${hour} ${schedule.dayOfMonth} ${schedule.month} *`;

    default:
      throw new Error(`Unsupported frequency: ${schedule.frequency}`);
  }
}
