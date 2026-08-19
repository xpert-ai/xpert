import type { SessionData } from 'express-session'
import { RedisSessionClient, RedisSessionStore } from './redis-session-store'

describe('RedisSessionStore', () => {
  it('persists, reads, refreshes, and destroys session data', async () => {
    const values = new Map<string, string>()
    const client: RedisSessionClient = {
      get: jest.fn(async (key: string) => values.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, value)
        return 'OK'
      }),
      pExpire: jest.fn(async () => true),
      del: jest.fn(async (key: string) => Number(values.delete(key)))
    }
    const firstStore = new RedisSessionStore(client)
    const secondStore = new RedisSessionStore(client)
    const session = { cookie: { maxAge: 10_000 }, userId: 'user-1' } as unknown as SessionData

    await new Promise<void>((resolve, reject) =>
      firstStore.set('sid-1', session, (error) => (error ? reject(error) : resolve()))
    )
    await expect(
      new Promise<SessionData | null>((resolve, reject) =>
        secondStore.get('sid-1', (error, value) => (error ? reject(error) : resolve(value ?? null)))
      )
    ).resolves.toEqual(session)

    await new Promise<void>((resolve, reject) =>
      secondStore.touch('sid-1', session, (error) => (error ? reject(error) : resolve()))
    )
    expect(client.pExpire).toHaveBeenCalledWith('sess:sid-1', 10_000)

    await new Promise<void>((resolve, reject) =>
      firstStore.destroy('sid-1', (error) => (error ? reject(error) : resolve()))
    )
    await expect(
      new Promise<SessionData | null>((resolve, reject) =>
        secondStore.get('sid-1', (error, value) => (error ? reject(error) : resolve(value ?? null)))
      )
    ).resolves.toBeNull()
  })

  it('propagates Redis renewal failures to the session middleware', async () => {
    const error = new Error('redis unavailable')
    const client: RedisSessionClient = {
      get: jest.fn(),
      set: jest.fn(),
      pExpire: jest.fn().mockRejectedValue(error),
      del: jest.fn()
    }
    const store = new RedisSessionStore(client)

    await expect(
      new Promise<void>((resolve, reject) =>
        store.touch('sid-1', { cookie: {} } as SessionData, (failure) => (failure ? reject(failure) : resolve()))
      )
    ).rejects.toBe(error)
  })
})
