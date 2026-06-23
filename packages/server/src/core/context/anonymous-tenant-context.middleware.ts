import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import {
  ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY,
  AnonymousTenantResolverService
} from '../../tenant/anonymous-tenant-resolver.service'
import { getFirstHeaderValue, getNormalizedRequestPath } from './tenant-domain.utils'

@Injectable()
export class AnonymousTenantContextMiddleware implements NestMiddleware {
  constructor(private readonly anonymousTenantResolver: AnonymousTenantResolverService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (!this.shouldResolve(req) || this.hasExplicitTenantContext(req)) {
      next()
      return
    }

    try {
      const resolution = await this.anonymousTenantResolver.resolve(req)
      const isPasswordLoginRequest = this.isPasswordLoginRequest(req)
      req[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY] = resolution

      if (resolution.tenantId && (!isPasswordLoginRequest || !resolution.fallbackApplied)) {
        req.headers['tenant-id'] = resolution.tenantId
      }

      if (resolution.organizationId && !isPasswordLoginRequest) {
        req.headers['organization-id'] = resolution.organizationId
      }

      next()
    } catch (error) {
      next(error)
    }
  }

  private shouldResolve(request: Request) {
    if (this.isPasswordLoginRequest(request)) {
      return true
    }

    if (request.method !== 'GET') {
      return false
    }

    const path = getNormalizedRequestPath(request)
    if (
      path === '/api/tenant/onboard' ||
      path === '/tenant/onboard' ||
      path === '/api/auth/sso/providers' ||
      path === '/auth/sso/providers'
    ) {
      return true
    }

    return /^\/(?:api\/)?[^/]+\/login\/start$/.test(path)
  }

  private isPasswordLoginRequest(request: Request) {
    const path = getNormalizedRequestPath(request)
    return request.method === 'POST' && (path === '/api/auth/login' || path === '/auth/login')
  }

  private hasExplicitTenantContext(request: Request) {
    return !!getFirstHeaderValue(request.headers['tenant-id'])
  }
}
