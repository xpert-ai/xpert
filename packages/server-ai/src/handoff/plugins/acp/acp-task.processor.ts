import { Injectable } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult,
  runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as runWithLegacyRequestContext } from '@xpert-ai/server-core'
import { AcpRuntimeService } from '../../../acp-runtime/acp-runtime.service'
import { ACP_TASK_MESSAGE_TYPE } from '../../../acp-runtime/handoff.contract'

@Injectable()
@HandoffProcessorStrategy(ACP_TASK_MESSAGE_TYPE, {
  types: [ACP_TASK_MESSAGE_TYPE],
  policy: {
    lane: 'subagent'
  }
})
export class AcpTaskHandoffProcessor implements IHandoffProcessor {
  constructor(private readonly runtimeService: AcpRuntimeService) {}

  async process(message: HandoffMessage, ctx: ProcessContext): Promise<ProcessResult> {
    const sessionId = readStringField(message.payload, 'sessionId')
    if (!sessionId) {
      return {
        status: 'dead',
        reason: 'Missing ACP sessionId in handoff payload'
      }
    }

    await this.runTaskWithRequestContext(message, async () => {
      await this.runtimeService.runQueuedSession(sessionId, ctx.abortSignal)
    })

    return { status: 'ok' }
  }

  private async runTaskWithRequestContext(message: HandoffMessage, task: () => Promise<void>): Promise<void> {
    const userId = readHeader(message, 'userId')
    const organizationId = readHeader(message, 'organizationId')
    const language = readHeader(message, 'language')

    if (!userId && !organizationId && !language) {
      await task()
      return
    }

    const headers: Record<string, string> = {
      ['tenant-id']: message.tenantId,
      ...(organizationId ? { ['organization-id']: organizationId } : {}),
      ...(language ? { language } : {})
    }
    const user = userId
      ? {
          id: userId,
          tenantId: message.tenantId
        }
      : undefined

    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          user,
          headers
        },
        null,
        () => {
          runWithLegacyRequestContext(
            {
              user,
              headers
            },
            () => {
              task().then(resolve).catch(reject)
            }
          )
        }
      )
    })
  }
}

function readHeader(message: HandoffMessage, key: 'userId' | 'organizationId' | 'language'): string | undefined {
  const value = message.headers?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined
}
