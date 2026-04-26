import { randomUUID } from 'crypto'
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import type {
  CreatePendingBindingInput,
  CreatedPendingBindingRef,
  PendingSsoBindingFlow
} from '@xpert-ai/plugin-sdk'
import { REDIS_CLIENT } from '../../core/redis/types'

type RedisClientLike = {
  setEx?: (key: string, seconds: number, value: string) => Promise<unknown>
  get?: (key: string) => Promise<string | null>
  del?: (...keys: string[]) => Promise<unknown>
  getDel?: (key: string) => Promise<string | null>
}

export interface PendingSsoBindingChallengeRecord {
  ticket: string
  flow: PendingSsoBindingFlow
  provider: string
  subjectId: string
  tenantId: string
  organizationId?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  profile?: Record<string, any> | null
  returnTo?: string | null
  expiresAt: string
}

const PENDING_SSO_BINDING_PREFIX = 'auth:sso:bind:challenge:'
const PENDING_SSO_BINDING_TTL_SECONDS = 60 * 10

@Injectable()
export class PendingSsoBindingChallengeService {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClientLike
  ) {}

  async create(input: CreatePendingBindingInput): Promise<CreatedPendingBindingRef> {
    const provider = this.requireValue(input?.provider, 'provider')
    const subjectId = this.requireValue(input?.subjectId, 'subjectId')
    const tenantId = this.requireValue(input?.tenantId, 'tenantId')
    const ticket = randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + PENDING_SSO_BINDING_TTL_SECONDS * 1000).toISOString()
    const payload: PendingSsoBindingChallengeRecord = {
      ticket,
      flow: this.normalizeFlow(input?.flow),
      provider,
      subjectId,
      tenantId,
      organizationId: this.normalizeOptionalValue(input?.organizationId),
      displayName: this.normalizeOptionalValue(input?.displayName),
      avatarUrl: this.normalizeOptionalValue(input?.avatarUrl),
      profile: normalizeProfile(input?.profile),
      returnTo: this.normalizeOptionalValue(input?.returnTo),
      expiresAt
    }

    await this.set(this.buildKey(ticket), payload)
    return { ticket }
  }

  async get(ticket: string): Promise<PendingSsoBindingChallengeRecord | null> {
    const normalizedTicket = this.requireValue(ticket, 'ticket')
    const serialized = await this.redisClient.get?.(this.buildKey(normalizedTicket))
    return this.parse(serialized)
  }

  async consume(ticket: string): Promise<PendingSsoBindingChallengeRecord | null> {
    const normalizedTicket = this.requireValue(ticket, 'ticket')
    const key = this.buildKey(normalizedTicket)

    if (typeof this.redisClient.getDel === 'function') {
      return this.parse(await this.redisClient.getDel(key))
    }

    const serialized = await this.redisClient.get?.(key)
    if (serialized) {
      await this.delete(normalizedTicket)
    }
    return this.parse(serialized)
  }

  async delete(ticket: string): Promise<void> {
    const normalizedTicket = this.requireValue(ticket, 'ticket')
    await this.redisClient.del?.(this.buildKey(normalizedTicket))
  }

  private async set(key: string, payload: PendingSsoBindingChallengeRecord): Promise<void> {
    const serialized = JSON.stringify(payload)
    if (typeof this.redisClient.setEx !== 'function') {
      throw new InternalServerErrorException('Redis client does not support setEx for pending SSO binding challenges.')
    }
    await this.redisClient.setEx(key, PENDING_SSO_BINDING_TTL_SECONDS, serialized)
  }

  private buildKey(ticket: string): string {
    return `${PENDING_SSO_BINDING_PREFIX}${ticket}`
  }

  private parse(serialized: string | null | undefined): PendingSsoBindingChallengeRecord | null {
    if (!serialized) {
      return null
    }

    try {
      const parsed = JSON.parse(serialized) as PendingSsoBindingChallengeRecord
      if (!parsed?.ticket || !parsed?.provider || !parsed?.subjectId || !parsed?.tenantId) {
        return null
      }
      parsed.flow = this.normalizeFlow(parsed.flow)
      return parsed
    } catch {
      return null
    }
  }

  private requireValue(value: string | null | undefined, field: string): string {
    const normalized = this.normalizeOptionalValue(value)
    if (!normalized) {
      throw new InternalServerErrorException(`Pending SSO binding challenge field '${field}' is required.`)
    }
    return normalized
  }

  private normalizeOptionalValue(value: string | null | undefined): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  private normalizeFlow(flow: PendingSsoBindingFlow | null | undefined): PendingSsoBindingFlow {
    return flow === 'current_user_confirm' ? 'current_user_confirm' : 'anonymous_bind'
  }
}

function normalizeProfile(profile: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return null
  }

  return JSON.parse(JSON.stringify(profile))
}
