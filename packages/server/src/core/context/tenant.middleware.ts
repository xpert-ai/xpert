import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { RequestContext } from './request-context'
import { resolveTenantDomainFromRequest } from './tenant-domain.utils'

@Injectable()
export class TenantDomainMiddleware implements NestMiddleware {
	use(req: Request, res: Response, next: NextFunction) {
		if (!RequestContext.currentTenantId()) {
			req['tenant-domain'] = resolveTenantDomainFromRequest(req)
		}
		next()
	}
}
