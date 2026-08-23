jest.mock('../@core', () => ({
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_PROJECT: 'FEATURE_XPERT_PROJECT',
    FEATURE_XPERT_MARKETPLACE: 'FEATURE_XPERT_MARKETPLACE'
  },
  AIPermissionsEnum: {
    XPERT_EDIT: 'XPERT_EDIT',
    XPERT_PROJECT_VIEW: 'XPERT_PROJECT_VIEW'
  },
  RolesEnum: {
    ADMIN: 'ADMIN',
    AI_BUILDER: 'AI_BUILDER',
    SUPER_ADMIN: 'SUPER_ADMIN'
  },
  authGuard: jest.fn()
}))

jest.mock('./feature-gate', () => ({
  featureGate: jest.fn((featureKeys: string[], redirectCommands: string[]) => ({
    featureKeys,
    redirectCommands
  }))
}))

jest.mock('./features.component', () => ({
  FeaturesComponent: class FeaturesComponent {}
}))

jest.mock('../@shared/not-found', () => ({
  NotFoundComponent: class NotFoundComponent {}
}))

jest.mock('../app.service', () => ({
  AppService: class AppService {
    inWorkspace = {
      set: jest.fn()
    }
  }
}))

import { NgxPermissionsGuard } from 'ngx-permissions'
import { routes, xpertMarketplaceRouteGate, xpertProjectRouteGate } from './features-routing.module'

describe('features routing', () => {
  const children = routes[0].children ?? []

  it('mounts chat projects at the top-level /project route', () => {
    const route = children.find((item) => item.path === 'project')

    expect(route?.loadChildren).toEqual(expect.any(Function))
    expect(route?.canActivate).toContain(xpertProjectRouteGate)
    expect(route?.data?.permissions?.only).toEqual(['XPERT_PROJECT_VIEW'])
    expect(xpertProjectRouteGate).toEqual({
      featureKeys: ['FEATURE_XPERT', 'FEATURE_XPERT_PROJECT'],
      redirectCommands: ['/chat']
    })
  })

  it('does not mount migrated Analytics product routes', () => {
    for (const path of ['chatbi', 'data', 'models', 'story', 'indicator-app']) {
      expect(children.some((item) => item.path === path)).toBe(false)
    }
  })

  it('mounts plugins at the top level behind the Xpert edit permission', () => {
    const route = children.find((item) => item.path === 'plugins')

    expect(route?.loadComponent).toEqual(expect.any(Function))
    expect(route?.canActivate).toContain(NgxPermissionsGuard)
    expect(route?.data?.scopeContext).toBe('dual-scope')
    expect(route?.data?.permissions?.only).toEqual(['XPERT_EDIT'])
  })

  it('mounts MCP Monitor at the top level behind the super admin role', () => {
    const route = children.find((item) => item.path === 'operations')

    expect(route?.loadComponent).toEqual(expect.any(Function))
    expect(route?.canActivate).toContain(NgxPermissionsGuard)
    expect(route?.data?.title).toBe('MCP Monitor')
    expect(route?.data?.scopeContext).toBe('dual-scope')
    expect(route?.data?.permissions?.only).toEqual(['SUPER_ADMIN'])
  })

  it('mounts xpert access requests at the top level behind marketplace and reviewer role gates', () => {
    const route = children.find((item) => item.path === 'xpert-access-requests')

    expect(route?.loadComponent).toEqual(expect.any(Function))
    expect(route?.canActivate).toContain(NgxPermissionsGuard)
    expect(route?.canActivate).toContain(xpertMarketplaceRouteGate)
    expect(route?.data?.scopeContext).toBe('organization-only')
    expect(route?.data?.permissions?.only).toEqual(['AI_BUILDER', 'ADMIN', 'SUPER_ADMIN'])
  })

  it('mounts model providers at the top-level /copilot route', () => {
    const route = children.find((item) => item.path === 'copilot')

    expect(route?.loadChildren).toEqual(expect.any(Function))
    expect(route?.data?.title).toBe('Model Providers')
    expect(route?.data?.scopeContext).toBe('dual-scope')
  })
})
