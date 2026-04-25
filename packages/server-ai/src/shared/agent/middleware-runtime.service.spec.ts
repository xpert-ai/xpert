jest.mock('../../copilot-model/utils/context-size', () => ({
  ensureCopilotModelContextSize: jest.fn(),
}))

jest.mock('./execution', () => {
  const { XpertAgentExecutionStatusEnum } = require('@xpert-ai/contracts')
  const { XpertAgentExecutionUpsertCommand } = require('../../xpert-agent-execution/commands/upsert.command')
  const { XpertAgentExecutionOneQuery } = require('../../xpert-agent-execution/queries/get-one.query')

  return {
    wrapAgentExecution:
      (run: (execution: Record<string, unknown>) => Promise<{ output?: unknown; state: unknown }>, params: any) =>
      async () => {
        const { commandBus, queryBus, execution, subscriber, catchError } = params
        execution.status = XpertAgentExecutionStatusEnum.RUNNING

        let subexecution = await commandBus.execute(
          new XpertAgentExecutionUpsertCommand({
            ...execution,
          })
        )
        execution.id = subexecution.id
        subscriber?.next({ data: { event: 'start', data: subexecution } })

        let status = XpertAgentExecutionStatusEnum.SUCCESS
        let error = null
        let output = null

        try {
          const results = await run(execution)
          output = results?.output ?? null
          return results?.state
        } catch (caught) {
          status = XpertAgentExecutionStatusEnum.ERROR
          error = caught instanceof Error ? caught.message : String(caught)
          catchError?.(caught).catch(() => undefined)
          throw caught
        } finally {
          subexecution = await commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
              ...subexecution,
              ...execution,
              status,
              error,
              outputs: {
                output,
              },
            })
          )
          await queryBus.execute(new XpertAgentExecutionOneQuery(subexecution.id))
          subscriber?.next({ data: { event: 'end', data: subexecution } })
        }
      },
  }
})

import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { CopilotCheckLimitCommand } from '../../copilot-user/commands/check-limit.command'
import { CopilotTokenRecordCommand } from '../../copilot-user/commands/token-record.command'
import { ExceedingLimitException } from '../../core/errors'
import { CopilotGetOneQuery } from '../../copilot/queries/get-one.query'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries/get-one.query'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

describe('AgentMiddlewareRuntimeService', () => {
  let commandBus: { execute: jest.Mock }
  let queryBus: { execute: jest.Mock }
  let service: AgentMiddlewareRuntimeService

  beforeEach(() => {
    commandBus = {
      execute: jest.fn(),
    }
    queryBus = {
      execute: jest.fn(),
    }
    service = new AgentMiddlewareRuntimeService(
      commandBus as any,
      queryBus as any,
      {
        t: jest.fn().mockReturnValue('AI model not found'),
      } as any
    )

    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function mockCreateModelClientDependencies(options?: {
    tokenRecordError?: Error
  }) {
    const modelInstance = {
      invoke: jest.fn(),
    }
    const getModelInstance = jest.fn().mockReturnValue(modelInstance)

    queryBus.execute.mockImplementation(async (query: unknown) => {
      if (query instanceof CopilotGetOneQuery) {
        return {
          id: 'copilot-1',
          modelProvider: {
            id: 'provider-1',
            providerName: 'openai',
          },
        }
      }

      if (query instanceof GetCopilotProviderModelQuery) {
        return [
          {
            modelProperties: {
              reasoningEffort: 'medium',
            },
          },
        ]
      }

      if (query instanceof AIModelGetProviderQuery) {
        return {
          getModelInstance,
        }
      }

      throw new Error(`Unexpected query: ${query?.constructor?.name}`)
    })

    commandBus.execute.mockImplementation(async (command: unknown) => {
      if (command instanceof CopilotCheckLimitCommand) {
        return undefined
      }

      if (command instanceof CopilotTokenRecordCommand) {
        if (options?.tokenRecordError) {
          throw options.tokenRecordError
        }
        return undefined
      }

      throw new Error(`Unexpected command: ${command?.constructor?.name}`)
    })

    return {
      getModelInstance,
      modelInstance,
    }
  }

  it('creates a model client and records token usage through the runtime facade', async () => {
    const { getModelInstance, modelInstance } = mockCreateModelClientDependencies()
    const usageCallback = jest.fn()

    const client = await service.createModelClient(
      {
        copilotId: 'copilot-1',
        model: 'gpt-4o-mini',
        modelType: 'LLM',
      } as any,
      {
        usageCallback,
      }
    )

    expect(client).toBe(modelInstance)
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CopilotCheckLimitCommand))
    expect(getModelInstance).toHaveBeenCalledWith(
      'LLM',
      expect.objectContaining({
        model: 'gpt-4o-mini',
        copilot: expect.objectContaining({
          id: 'copilot-1',
        }),
      }),
      expect.objectContaining({
        modelProperties: {
          reasoningEffort: 'medium',
        },
      })
    )

    const modelOptions = getModelInstance.mock.calls[0][2]
    const usage = {
      totalTokens: 42,
      totalPrice: 1.25,
      currency: 'USD',
    }

    await modelOptions.handleLLMTokens({
      model: 'gpt-4o-mini',
      usage,
    })

    expect(usageCallback).toHaveBeenCalledWith(usage)

    const tokenRecordCommand = commandBus.execute.mock.calls.find(
      ([command]) => command instanceof CopilotTokenRecordCommand
    )?.[0] as CopilotTokenRecordCommand

    expect(tokenRecordCommand.input).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        model: 'gpt-4o-mini',
        tokenUsed: 42,
        priceUsed: 1.25,
        currency: 'USD',
      })
    )
  })

  it('aborts the active model request when token recording hits an exceeding-limit error', async () => {
    const { getModelInstance } = mockCreateModelClientDependencies({
      tokenRecordError: new ExceedingLimitException('quota exceeded'),
    })
    const abortController = {
      abort: jest.fn(),
      signal: {
        aborted: false,
      },
    } as any

    await service.createModelClient(
      {
        copilotId: 'copilot-1',
        model: 'gpt-4o-mini',
        modelType: 'LLM',
      } as any,
      {
        abortController,
        usageCallback: jest.fn(),
      }
    )

    const modelOptions = getModelInstance.mock.calls[0][2]
    await modelOptions.handleLLMTokens({
      model: 'gpt-4o-mini',
      usage: {
        totalTokens: 99,
        totalPrice: 2,
        currency: 'USD',
      },
    })

    expect(abortController.abort).toHaveBeenCalledWith('quota exceeded')
  })

  it('wraps workflow node execution and preserves start/end lifecycle events', async () => {
    const upsertCommands: XpertAgentExecutionUpsertCommand[] = []
    const subscriber = {
      next: jest.fn(),
    }

    commandBus.execute.mockImplementation(async (command: unknown) => {
      if (command instanceof XpertAgentExecutionUpsertCommand) {
        upsertCommands.push(command)
        return {
          id: 'subexec-1',
          ...command.execution,
        }
      }

      throw new Error(`Unexpected command: ${command?.constructor?.name}`)
    })
    queryBus.execute.mockImplementation(async (query: unknown) => {
      if (query instanceof XpertAgentExecutionOneQuery) {
        return {
          id: query.id,
          status: XpertAgentExecutionStatusEnum.SUCCESS,
        }
      }

      throw new Error(`Unexpected query: ${query?.constructor?.name}`)
    })

    const result = await service.wrapWorkflowNodeExecution(
      async (execution) => {
        expect(execution.id).toBe('subexec-1')
        return {
          state: 'done',
          output: 'tracked output',
        }
      },
      {
        execution: {
          category: 'workflow',
          type: 'middleware',
          title: 'Tracked Middleware',
          threadId: 'thread-1',
        } as any,
        subscriber: subscriber as any,
      }
    )

    expect(result).toBe('done')
    expect(upsertCommands).toHaveLength(2)
    expect(upsertCommands[0].execution.status).toBe(XpertAgentExecutionStatusEnum.RUNNING)
    expect(upsertCommands[1].execution.status).toBe(XpertAgentExecutionStatusEnum.SUCCESS)
    expect(upsertCommands[1].execution.outputs).toEqual({
      output: 'tracked output',
    })
    expect(subscriber.next).toHaveBeenCalledTimes(2)
  })

  it('records error state when wrapped workflow execution fails', async () => {
    const upsertCommands: XpertAgentExecutionUpsertCommand[] = []
    const catchError = jest.fn().mockResolvedValue(undefined)
    const subscriber = {
      next: jest.fn(),
    }

    commandBus.execute.mockImplementation(async (command: unknown) => {
      if (command instanceof XpertAgentExecutionUpsertCommand) {
        upsertCommands.push(command)
        return {
          id: 'subexec-2',
          ...command.execution,
        }
      }

      throw new Error(`Unexpected command: ${command?.constructor?.name}`)
    })
    queryBus.execute.mockImplementation(async (query: unknown) => {
      if (query instanceof XpertAgentExecutionOneQuery) {
        return {
          id: query.id,
          status: XpertAgentExecutionStatusEnum.ERROR,
        }
      }

      throw new Error(`Unexpected query: ${query?.constructor?.name}`)
    })

    await expect(
      service.wrapWorkflowNodeExecution(
        async () => {
          throw new Error('boom')
        },
        {
          execution: {
            category: 'workflow',
            type: 'middleware',
            title: 'Failing Middleware',
          } as any,
          subscriber: subscriber as any,
          catchError,
        }
      )
    ).rejects.toThrow('boom')

    await Promise.resolve()

    expect(upsertCommands).toHaveLength(2)
    expect(upsertCommands[1].execution.status).toBe(XpertAgentExecutionStatusEnum.ERROR)
    expect(upsertCommands[1].execution.error).toBe('boom')
    expect(catchError).toHaveBeenCalledWith(expect.any(Error))
    expect(subscriber.next).toHaveBeenCalledTimes(2)
  })
})
