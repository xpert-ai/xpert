import { HttpException } from '@nestjs/common'
import { AIPermissionsEnum, IUser, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { sign } from 'jsonwebtoken'
import { als, RequestContext } from './request-context'

describe('RequestContext authenticated permissions', () => {
  const create = AIPermissionsEnum.XPERT_PROJECT_CREATE
  const permission = PermissionsEnum.ALL_ORG_VIEW
  const user = {
    id: 'human',
    tenantId: 'tenant',
    role: {
      name: RolesEnum.ADMIN,
      rolePermissions: [
        { permission: create, enabled: true },
        { permission, enabled: true },
        { permission: AIPermissionsEnum.XPERT_PROJECT_EDIT, enabled: false }
      ]
    }
  } as IUser

  function inRequest<T>(token: string, principal: IUser | undefined, work: () => T): T {
    const request = Object.assign(new IncomingMessage(new Socket()), {
      headers: { authorization: `Bearer ${token}` },
      user: principal
    })
    return als.run(new RequestContext(request, new ServerResponse(request), 'test'), work)
  }

  it.each(['cs-x-session', 'api-key', 'oidc-access-token'])(
    'uses authenticated role permissions with a %s bearer',
    (token) => {
      inRequest(token, user, () => {
        expect(RequestContext.hasPermission(create)).toBe(true)
        expect(RequestContext.hasPermissions([create, permission])).toBe(true)
        expect(RequestContext.hasAnyPermission([permission])).toBe(true)
        expect(RequestContext.hasRole(RolesEnum.ADMIN)).toBe(true)
      })
    }
  )

  it('rejects disabled permissions and incomplete all-permission grants', () => {
    inRequest('cs-x-session', user, () => {
      expect(RequestContext.hasPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)).toBe(false)
      expect(RequestContext.hasPermissions([create, AIPermissionsEnum.XPERT_PROJECT_EDIT])).toBe(false)
      expect(RequestContext.hasAnyPermission([PermissionsEnum.ALL_ORG_EDIT])).toBe(false)
    })
  })

  it.each([undefined, { id: 'human' } as IUser])('fails closed without authenticated permissions (%p)', (principal) => {
    inRequest('cs-x-session', principal, () => {
      expect(RequestContext.hasPermission(create)).toBe(false)
      expect(RequestContext.hasAnyPermission([permission])).toBe(false)
      expect(() => RequestContext.hasPermission(create, true)).toThrow(HttpException)
      expect(() => RequestContext.hasAnyPermission([permission], true)).toThrow(HttpException)
    })
  })

  it('does not use bearer claims to override the authenticated user', () => {
    const token = sign({ permissions: [create], role: RolesEnum.SUPER_ADMIN }, 'test-signing-secret')
    inRequest(token, { id: 'human', role: { name: RolesEnum.VIEWER, rolePermissions: [] } } as IUser, () => {
      expect(RequestContext.hasPermission(create)).toBe(false)
      expect(RequestContext.hasRole(RolesEnum.SUPER_ADMIN)).toBe(false)
      expect(RequestContext.hasRole(RolesEnum.VIEWER)).toBe(true)
    })
  })

  it('denies access when there is no request context', () => {
    expect(RequestContext.hasPermission(create)).toBe(false)
    expect(RequestContext.hasAnyPermission([permission])).toBe(false)
  })
})
