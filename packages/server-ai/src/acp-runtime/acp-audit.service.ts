import { TAcpSessionEventType } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { AcpSession } from './acp-session.entity'
import { AcpSessionEvent } from './acp-session-event.entity'
import { AcpSessionEventService } from './acp-session-event.service'

@Injectable()
export class AcpAuditService {
  constructor(private readonly eventService: AcpSessionEventService) {}

  async appendEvent(
    session: Pick<AcpSession, 'id' | 'tenantId' | 'organizationId' | 'executionId'>,
    type: TAcpSessionEventType,
    payload?: Record<string, unknown> | null
  ): Promise<AcpSessionEvent> {
    const sequence = await this.eventService.getNextSequence(session.id)
    const redactedPayload = payload ? redactPayload(payload) : null

    return this.eventService.create({
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      sessionId: session.id,
      executionId: session.executionId ?? null,
      sequence,
      type,
      payload: payload ?? null,
      redactedPayload
    })
  }
}

function redactPayload(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    output[key] = redactUnknown(entryValue, key)
  }
  return output
}

function redactUnknown(value: unknown, keyHint?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item))
  }

  if (isSensitiveKey(keyHint)) {
    return '[REDACTED]'
  }

  if (isObjectLike(value)) {
    const output: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value)) {
      output[key] = redactUnknown(entryValue, key)
    }
    return output
  }

  return value
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isSensitiveKey(value: string | undefined): boolean {
  return typeof value === 'string' && /(secret|token|authorization|api[-_]?key|password|cookie|header)/i.test(value)
}
