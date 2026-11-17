import { readProjectExecutionConfig } from './project-execution-config'

jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('./database', () => ({ dbConnectionConfig: { type: 'postgres' } }))

describe('Project execution environment defaults', () => {
  it('defaults to twelve hours and one hundred million tokens', () => {
    expect(readProjectExecutionConfig({})).toEqual({ taskMaxDurationSeconds: 43200, pipelineMaxTokens: 100000000 })
    expect(readProjectExecutionConfig({ XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: ' ' })).toEqual(
      readProjectExecutionConfig({})
    )
  })
  it('reads bounded integer overrides', () => {
    expect(
      readProjectExecutionConfig({
        XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: '86400',
        XPERT_PIPELINE_DEFAULT_MAX_TOKENS: '2500000'
      })
    ).toEqual({ taskMaxDurationSeconds: 86400, pipelineMaxTokens: 2500000 })
  })
  it.each(['0', '-1', '3600.5', 'Infinity', 'abc', '86401'])('rejects invalid task seconds %s', (value) => {
    expect(() => readProjectExecutionConfig({ XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: value })).toThrow(
      'XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS'
    )
  })
  it.each(['9999', '-1', '10000.5', 'NaN', '1e8', '1000000000001'])('rejects invalid token ceilings %s', (value) => {
    expect(() => readProjectExecutionConfig({ XPERT_PIPELINE_DEFAULT_MAX_TOKENS: value })).toThrow(
      'XPERT_PIPELINE_DEFAULT_MAX_TOKENS'
    )
  })
  it.each(['development', 'production'])('maps bootstrap environment and typed overrides in %s', (mode) => {
    const previous = process.env
    process.env = {
      ...previous,
      NODE_ENV: mode,
      XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: '21600',
      XPERT_PIPELINE_DEFAULT_MAX_TOKENS: '3000000'
    }
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      jest.isolateModules(() => {
        const { getConfig, setConfig } = jest.requireActual<typeof import('./config-manager')>('./config-manager')
        expect(getConfig().projectExecutionOptions).toEqual({
          taskMaxDurationSeconds: 21600,
          pipelineMaxTokens: 3000000
        })
        setConfig({ projectExecutionOptions: { taskMaxDurationSeconds: 43200, pipelineMaxTokens: 9000000 } })
        expect(getConfig().projectExecutionOptions).toEqual({
          taskMaxDurationSeconds: 43200,
          pipelineMaxTokens: 9000000
        })
      })
    } finally {
      process.env = previous
      jest.restoreAllMocks()
    }
  })
})
