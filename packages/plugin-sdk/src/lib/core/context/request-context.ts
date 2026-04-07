// request-context.ts
import {
  IApiKey,
  IRequestScopeContext,
  IUser,
  LanguagesEnum,
  PermissionsEnum,
  RolesEnum
} from '@metad/contracts'
import type { IApiPrincipal, RequestScopeLevel } from '@metad/contracts'
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'http'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ExtractJwt } from 'passport-jwt'
import { JsonWebTokenError, verify } from 'jsonwebtoken'

const TENANT_SCOPE = 'tenant' as RequestScopeLevel
const ORGANIZATION_SCOPE = 'organization' as RequestScopeLevel

export class RequestContext {
  constructor(
    public readonly request: IncomingMessage,
    public readonly response: ServerResponse,
    public readonly reqId: string,
    public readonly userId?: string,
    public readonly extras: Record<string, any> = {}
  ) {}

  static currentRequestContext(): RequestContext {
    const session = getRequestContext()
    return session
  }

  static currentApiKey(): IApiKey | null {
		return RequestContext.currentApiPrincipal()?.apiKey ?? null;
	}

	static currentApiPrincipal(): IApiPrincipal | null {
		const user = RequestContext.currentUser() as IApiPrincipal | null;
		return user?.apiKey ? user : null;
	}

  static currentRequest(): IncomingMessage {
    const requestContext = RequestContext.currentRequestContext()

    if (requestContext) {
      return requestContext.request
    }

    return null
  }

  static currentTenantId(): string {
    const user: IUser = RequestContext.currentUser()
    if (user) {
      return user.tenantId
    }

    return null
  }

  static currentUserId(): string {
    const user: IUser = RequestContext.currentUser()
    if (user) {
      return user.id
    }
    return null
  }

  static currentRoleId(): string {
    const user: IUser = RequestContext.currentUser()
    if (user) {
      return user.roleId
    }
    return null
  }

  static currentUser(throwError?: boolean): IUser {
    const requestContext = RequestContext.currentRequestContext()

    if (requestContext) {
      // tslint:disable-next-line
      const user: IUser = requestContext.request['user']

      if (user) {
        return user
      }
    }

    if (throwError) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }

    return null
  }

  static hasPermission(permission: PermissionsEnum | string, throwError?: boolean): boolean {
    return this.hasPermissions([permission], throwError)
  }

  /**
   * Retrieves the language code from the headers of the current request.
   * @returns The language code (LanguagesEnum) extracted from the headers, or the default language (ENGLISH) if not found.
   */
  static getLanguageCode(): LanguagesEnum {
    // Retrieve the current request
    const req = RequestContext.currentRequest()

    // Variable to store the extracted language code
    let lang: LanguagesEnum

    // Check if a request exists
    if (req) {
      // Check if the 'language' header exists in the request
      if (req.headers && req.headers['language']) {
        // If found, set the lang variable
        lang = req.headers['language'] as LanguagesEnum
      }
    }

    // Return the extracted language code or the default language (ENGLISH) if not found
    return lang || LanguagesEnum.English
  }

  static getScope(): IRequestScopeContext {
    const request = this.currentRequest()
    const user = this.currentUser()
    const tenantId = user?.tenantId ?? getHeaderValue(request, ['tenant-id']) ?? null
    const organizationId = getHeaderValue(request, ['organization-id']) ?? null
    const scopeLevelHeader = getHeaderValue(request, ['x-scope-level'])

    if (scopeLevelHeader) {
      if (
        scopeLevelHeader !== TENANT_SCOPE &&
        scopeLevelHeader !== ORGANIZATION_SCOPE
      ) {
        throw new BadRequestException(`Unsupported scope level: ${scopeLevelHeader}`)
      }

      if (scopeLevelHeader === TENANT_SCOPE) {
        if (organizationId) {
          throw new BadRequestException('Tenant scope requests must not include Organization-Id.')
        }

        return {
          tenantId,
          level: TENANT_SCOPE,
          organizationId: null
        }
      }

      if (!organizationId) {
        throw new BadRequestException('Organization scope requests require Organization-Id.')
      }

      return {
        tenantId,
        level: ORGANIZATION_SCOPE,
        organizationId
      }
    }

    if (organizationId) {
      return {
        tenantId,
        level: ORGANIZATION_SCOPE,
        organizationId
      }
    }

    return {
      tenantId,
      level: TENANT_SCOPE,
      organizationId: null
    }
  }

  static getOrganizationId(): string | null {
    return this.getScope().organizationId
  }

  static isTenantScope(): boolean {
    return this.getScope().level === TENANT_SCOPE
  }

  static isOrganizationScope(): boolean {
    return this.getScope().level === ORGANIZATION_SCOPE
  }

  static requireOrganizationScope(): string {
    const scope = this.getScope()
    if (scope.level !== ORGANIZATION_SCOPE || !scope.organizationId) {
      throw new BadRequestException('Organization scope is required for this operation.')
    }

    return scope.organizationId
  }

  static hasPermissions(findPermissions: Array<PermissionsEnum | string>, throwError?: boolean): boolean {
    const requestContext = RequestContext.currentRequestContext()

    if (requestContext) {
      // tslint:disable-next-line
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(requestContext.request as any)

      if (token) {
        const { permissions } = verify(token, process.env['JWT_SECRET']) as {
          id: string
          permissions: PermissionsEnum[]
        }
        if (permissions) {
          const found = permissions.filter((value) => findPermissions.indexOf(value) >= 0)

          if (found.length === findPermissions.length) {
            return true
          }
        } else {
          return false
        }
      }
    }

    if (throwError) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }
    return false
  }

  static hasAnyPermission(findPermissions: PermissionsEnum[], throwError?: boolean): boolean {
    const requestContext = RequestContext.currentRequestContext()

    if (requestContext) {
      // tslint:disable-next-line
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(requestContext.request as any)

      if (token) {
        const { permissions } = verify(token, process.env['JWT_SECRET']) as {
          id: string
          permissions: PermissionsEnum[]
        }
        const found = permissions.filter((value) => findPermissions.indexOf(value) >= 0)
        if (found.length > 0) {
          return true
        }
      }
    }

    if (throwError) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }
    return false
  }

  static currentToken(throwError?: boolean): any {
    const requestContext = RequestContext.currentRequestContext()

    if (requestContext) {
      // tslint:disable-next-line
      return ExtractJwt.fromAuthHeaderAsBearerToken()(requestContext.request as any)
    }

    if (throwError) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }
    return null
  }

  /**
   * Checks if the current user has a specific role.
   * @param {RolesEnum} role - The role to check.
   * @param {boolean} throwError - Flag indicating whether to throw an error if the role is not granted.
   * @returns {boolean} - True if the user has the role, otherwise false.
   */
  static hasRole(role: RolesEnum, throwError?: boolean): boolean {
    return this.hasRoles([role], throwError)
  }

  /**
   * Checks if the current request context has any of the specified roles.
   *
   * @param roles - An array of roles to check.
   * @param throwError - Whether to throw an error if no roles are found.
   * @returns True if any of the required roles are found, otherwise false.
   */
  static hasRoles(roles: RolesEnum[], throwError?: boolean): boolean {
    const context = RequestContext.currentRequestContext()
    if (context) {
      try {
        // tslint:disable-next-line
        const token = this.currentToken()
        if (token) {
          const { role } = verify(token, process.env['JWT_SECRET']) as { id: string; role: RolesEnum }
          return roles.includes(role ?? null)
        } else if (this.currentUser().role) {
          return roles.includes(this.currentUser().role.name as RolesEnum)
        }
      } catch (error) {
        if (error instanceof JsonWebTokenError) {
          return false
        } else {
          throw error
        }
      }
    }
    if (throwError) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    }
    return false
  }
}

export const als = new AsyncLocalStorage<RequestContext>()

export function getRequestContext() {
  return als.getStore()
}

function getHeaderValue(
  req: IncomingMessage | null,
  keys: string[]
): string | null {
  if (!req?.headers) {
    return null
  }

  for (const key of keys) {
    const value = req.headers[key]
    if (Array.isArray(value)) {
      return value[0] ?? null
    }
    if (typeof value === 'string' && value) {
      return value
    }
  }

  return null
}
