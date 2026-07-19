export const MANAGED_QUEUE_SERVICE_TOKEN = 'XPERT_MANAGED_QUEUE_SERVICE'
export const MANAGED_QUEUE_HANDLER_REGISTRY_TOKEN = 'XPERT_MANAGED_QUEUE_HANDLER_REGISTRY'
export const PLUGIN_JOB_PROCESSOR_METADATA = 'XPERT_PLUGIN_JOB_PROCESSOR_METADATA'

export type PluginJobProcessorOptions = {
  pluginName: string
  queueName?: string
  queue?: string
  jobName?: string
  jobType?: string
  concurrency?: number
}

export type PluginJobProcessorMetadata = {
  pluginName: string
  queueName: string
  jobName: string
  concurrency?: number
}

/** Physical worker pool chosen independently from a plugin's logical queue name. */
export type ManagedQueueExecutionPool = 'default' | 'sandbox-browser'

/** Readiness signal used to reject work before it is stranded in an unconsumed pool. */
export type ManagedQueueExecutionPoolHealth = {
  executionPool: ManagedQueueExecutionPool
  available: boolean
  workerCount: number
  warning?: string
}

export type ManagedQueueRemoveOption =
  | boolean
  | number
  | {
      age?: number
      count?: number
    }

export type ManagedQueueBackoffInput =
  | number
  | {
      type?: 'fixed' | 'exponential'
      delay: number
    }

export type ManagedQueueRedis = {
  get(key: string): Promise<string | null>
  set(
    key: string,
    value: string,
    mode?: string,
    ttlMode?: string | number,
    ttlOrMode?: number | string
  ): Promise<string | null>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
}

export type ManagedQueueEnqueueInput<TPayload = unknown> = {
  pluginName: string
  queueName: string
  jobName: string
  payload: TPayload
  tenantId?: string | null
  organizationId?: string | null
  /** Plugin installation scope used to route to the matching processor (for example system:global or an organization id). */
  scopeKey?: string | null
  userId?: string | null
  jobId?: string
  delayMs?: number
  attempts?: number
  backoffMs?: ManagedQueueBackoffInput
  removeOnComplete?: ManagedQueueRemoveOption
  removeOnFail?: ManagedQueueRemoveOption
  /** Defaults to `default`; browser-heavy jobs must explicitly select the isolated pool. */
  executionPool?: ManagedQueueExecutionPool
}

export type ManagedQueueEnqueueResult = {
  jobId: string
}

export type ManagedQueueCancelInput = {
  jobId: string
  executionPool?: ManagedQueueExecutionPool
}

export type ManagedQueueCancelResult = {
  success: boolean
  jobId: string
  state?: string
  reason?: 'not_found' | 'active' | 'completed' | 'failed' | 'locked' | 'not_removable'
  error?: string
}

export type ManagedQueueJob<TPayload = unknown> = {
  id?: string
  name: string
  data: TPayload
  attemptsMade: number
  opts?: Record<string, unknown>
}

export type ManagedQueueJobContext = {
  pluginName: string
  queueName: string
  jobName: string
  scopeKey?: string | null
  /** Persisted queue ownership restored independently of ambient request context. */
  tenantId?: string | null
  organizationId?: string | null
  /** Business actor captured when the logical job was enqueued. */
  userId?: string | null
}

export type ManagedQueueJobSnapshot<TPayload = unknown> = ManagedQueueJob<TPayload> & {
  state?: string
  /** BullMQ terminal failure text, when the physical job is in the failed state. */
  failedReason?: string
  timestamp?: number
  processedOn?: number
  finishedOn?: number
}

export type ManagedQueueJobHandler<TPayload = unknown> = (
  job: ManagedQueueJob<TPayload>,
  context: ManagedQueueJobContext
) => Promise<void> | void

export interface ManagedQueueJobProcessor<TPayload = unknown> {
  handle(job: ManagedQueueJob<TPayload>, context: ManagedQueueJobContext): Promise<void> | void
}

export type ManagedQueueHandlerRegistration<TPayload = unknown> = {
  pluginName: string
  queueName: string
  jobName: string
  scopeKey?: string | null
  concurrency?: number
  handler: ManagedQueueJobHandler<TPayload>
}

export interface ManagedQueueHandlerRegistry {
  register<TPayload = unknown>(registration: ManagedQueueHandlerRegistration<TPayload>): () => void
}

export interface ManagedQueueService {
  enqueue<TPayload = unknown>(input: ManagedQueueEnqueueInput<TPayload>): Promise<ManagedQueueEnqueueResult>
  cancel(input: ManagedQueueCancelInput): Promise<ManagedQueueCancelResult>
  getJob<TPayload = unknown>(input: {
    jobId: string
    executionPool?: ManagedQueueExecutionPool
  }): Promise<ManagedQueueJobSnapshot<TPayload> | null>
  /** Reports active BullMQ consumers for a physical execution pool. */
  getExecutionPoolHealth(input: { executionPool: ManagedQueueExecutionPool }): Promise<ManagedQueueExecutionPoolHealth>
  getRedis(): Promise<ManagedQueueRedis>
}

export function PluginJobProcessor(options: PluginJobProcessorOptions): ClassDecorator {
  return (target) => {
    const metadata = normalizePluginJobProcessorMetadata(options)
    const existing =
      (Reflect.getMetadata(PLUGIN_JOB_PROCESSOR_METADATA, target) as PluginJobProcessorMetadata[] | undefined) ?? []
    Reflect.defineMetadata(PLUGIN_JOB_PROCESSOR_METADATA, [metadata, ...existing], target)
  }
}

function normalizePluginJobProcessorMetadata(options: PluginJobProcessorOptions): PluginJobProcessorMetadata {
  const pluginName = requireManagedQueueDecoratorValue(options.pluginName, 'pluginName')
  const queueName = requireManagedQueueDecoratorValue(options.queueName ?? options.queue, 'queueName')
  const jobName = requireManagedQueueDecoratorValue(options.jobName ?? options.jobType, 'jobName')
  const concurrency = options.concurrency

  if (concurrency !== undefined && (!Number.isFinite(concurrency) || concurrency <= 0)) {
    throw new Error('PluginJobProcessor concurrency must be a positive number')
  }

  return {
    pluginName,
    queueName,
    jobName,
    ...(concurrency === undefined ? {} : { concurrency: Math.trunc(concurrency) })
  }
}

function requireManagedQueueDecoratorValue(value: string | null | undefined, field: string) {
  const normalized = `${value ?? ''}`.trim()
  if (!normalized) {
    throw new Error(`PluginJobProcessor ${field} is required`)
  }
  return normalized
}
