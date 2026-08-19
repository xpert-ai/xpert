import type { SessionData } from 'express-session'
import session = require('express-session')
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000

export interface RedisSessionClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options: { PX: number }): Promise<unknown>
  pExpire(key: string, ttl: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

/** Redis-backed store used by every API instance for the same session cookie. */
export class RedisSessionStore extends session.Store {
  constructor(
    private readonly client: RedisSessionClient,
    private readonly prefix = 'sess:'
  ) {
    super()
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    void this.client
      .get(this.key(sid))
      .then((value) => callback(null, value ? (JSON.parse(value) as SessionData) : null))
      .catch((error) => callback(error))
  }

  set(sid: string, value: SessionData, callback?: (err?: unknown) => void): void {
    void this.client
      .set(this.key(sid), JSON.stringify(value), { PX: this.ttlMs(value) })
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    void this.client
      .del(this.key(sid))
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  touch(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    void this.client
      .pExpire(this.key(sid), this.ttlMs(value))
      .then(() => callback?.())
      .catch((error) => callback?.(error))
  }

  private key(sid: string): string {
    return `${this.prefix}${sid}`
  }

  private ttlMs(value: SessionData): number {
    return Math.max(1, value.cookie?.maxAge ?? DEFAULT_SESSION_TTL_MS)
  }
}
