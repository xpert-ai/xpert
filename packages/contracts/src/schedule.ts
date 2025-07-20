export enum ScheduleTaskStatus {
  PAUSED = 'paused',
  ARCHIVED = 'archived',
  SCHEDULED = 'scheduled',
}
export enum TaskFrequency {
  Once = 'Once',
  Daily = 'Daily',
  Weekly = 'Weekly',
  Monthly = 'Monthly',
  Yearly = 'Yearly',
}

export type TScheduleOptions = {
  frequency: TaskFrequency
  time: string; // 'HH:mm'
  dayOfWeek?: number; // 0-6 (0 = Sunday)
  dayOfMonth?: number; // 1-31
  month?: number; // 1-12
  date?: string; // 'YYYY-MM-DD'
}

/**
 * Generate cron expression: Minutes Hour Day Month Week
 * 
 * @param schedule 
 * @returns 
 */
export function generateCronExpression(schedule: TScheduleOptions): string {
  if (!schedule.time) throw new Error('Time is required for scheduling');
  
  const [hourStr, minuteStr] = schedule.time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Invalid time format. Expected HH:mm with valid hour and minute.');
  }

  switch (schedule.frequency) {
    case TaskFrequency.Once: {
      if (!schedule.date) throw new Error('Date is required for Once schedule');
      const date = new Date(schedule.date);
      // if (isNaN(date.getTime())) throw new Error('Invalid date format for Once schedule');
      return `${minute} ${hour} ${date.getDate()} ${date.getMonth() + 1} *`;
    }

    case TaskFrequency.Daily:
      return `${minute} ${hour} * * *`;

    case TaskFrequency.Weekly:
      if (schedule.dayOfWeek === undefined || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)
        throw new Error('Valid dayOfWeek (0-6) is required for Weekly schedule');
      return `${minute} ${hour} * * ${schedule.dayOfWeek}`;

    case TaskFrequency.Monthly:
      if (!schedule.dayOfMonth || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)
        throw new Error('Valid dayOfMonth (1-31) is required for Monthly schedule');
      return `${minute} ${hour} ${schedule.dayOfMonth} * *`;

    case TaskFrequency.Yearly: {
      if (!schedule.date) throw new Error('Date is required for Yearly schedule');
      const date = new Date(schedule.date);
      // if (isNaN(date.getTime())) throw new Error('Invalid date format for Yearly schedule');
      return `${minute} ${hour} ${date.getDate()} ${date.getMonth() + 1} *`;
    }

    default:
      throw new Error(`Unsupported frequency: ${schedule.frequency}`);
  }
}
