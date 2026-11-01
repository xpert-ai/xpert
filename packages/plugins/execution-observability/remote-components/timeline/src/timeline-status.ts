import type { ExecutionObservationRecord } from '@xpert-ai/contracts'
export const statusClass: Record<ExecutionObservationRecord['status'], string> = {
  running: 'border-primary/40 bg-primary/15 dark:bg-primary/15 text-foreground',
  success: 'border-success/40 bg-success/10 dark:bg-success/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 dark:bg-destructive/10 text-foreground',
  timeout: 'border-destructive/40 bg-destructive/10 dark:bg-destructive/10 text-foreground',
  pending: 'border-border bg-muted dark:bg-muted text-muted-foreground',
  interrupted: 'border-warning/50 bg-warning/10 dark:bg-warning/10 text-foreground',
  unknown: 'border-dashed border-border bg-muted dark:bg-muted text-muted-foreground'
}
