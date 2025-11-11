// request-context.middleware.ts
import { IUser } from '@metad/contracts'
import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { IncomingMessage, ServerResponse } from 'node:http'
import { als, RequestContext } from './request-context'

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: IncomingMessage, _res: ServerResponse, next: () => void) {
    const reqId = (req.headers['x-request-id'] as string) || randomUUID()
    // The userId can be placed in the authentication result here.
    const userId = req['user']?.['id']
    const ctx = new RequestContext(req, _res, reqId, userId)

    als.run(ctx, next)
  }
}

export function runWithRequestContext(req: Partial<IncomingMessage> & {user?: IUser}, res: Partial<ServerResponse>, next: () => void) {
  const reqId = (req.headers['x-request-id'] as string) || randomUUID()
  const userId = req['user']?.['id']
  const ctx = new RequestContext(req as IncomingMessage, res as ServerResponse, reqId, userId)

  // Enable ALS scope
  als.run(ctx, next)
}
