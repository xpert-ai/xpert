import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import expressSession from 'express-session'
import type { RedisClientType } from 'redis'
import { RedisSessionStore } from './redis-session-store'

export function configureSession(
  app: NestExpressApplication,
  options: {
    secret: string
    secure: boolean
  }
) {
  const redisClient = app.get<RedisClientType>(REDIS_CLIENT)
  app.use(
    expressSession({
      secret: options.secret,
      store: new RedisSessionStore(redisClient),
      resave: false,
      saveUninitialized: false,
      cookie: { secure: options.secure }
    })
  )
}
