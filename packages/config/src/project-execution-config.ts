import type { IPluginConfig } from '@xpert-ai/server-common'

/** Bootstrap defaults only. Persisted policies, bindings and running deadlines retain their values. */
export function readProjectExecutionConfig(
  env: NodeJS.ProcessEnv
): NonNullable<IPluginConfig['projectExecutionOptions']> {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const text = env[name]?.trim()
    if (!text) return fallback
    const value = Number(text)
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid ${name}: expected an integer between ${min} and ${max}`)
    return value
  }
  return {
    taskMaxDurationSeconds: integer('XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS', 43200, 60, 86400),
    pipelineMaxTokens: integer('XPERT_PIPELINE_DEFAULT_MAX_TOKENS', 100000000, 10000, 1000000000000)
  }
}
