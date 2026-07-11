jest.mock('../@core', () => ({
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_MARKETPLACE: 'FEATURE_XPERT_MARKETPLACE'
  },
  AnalyticsPermissionsEnum: {
    STORIES_VIEW: 'STORIES_VIEW',
    STORIES_EDIT: 'STORIES_EDIT',
    MODELS_EDIT: 'MODELS_EDIT',
    INDICATOR_MARTKET_VIEW: 'INDICATOR_MARTKET_VIEW'
  },
  AIPermissionsEnum: {
    XPERT_EDIT: 'XPERT_EDIT'
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
import { routes, xpertMarketplaceRouteGate } from './features-routing.module'

describe('features routing', () => {
  const children = routes[0].children ?? []

  it('mounts chat projects at the top-level /project route', () => {
    const route = children.find((item) => item.path === 'project')

    expect(route?.loadChildren).toEqual(expect.any(Function))
  })

  it('mounts ChatBI Assistant at the top-level /chatbi route', () => {
    const route = children.find((item) => item.path === 'chatbi')

    expect(route?.loadChildren).toEqual(expect.any(Function))
    expect(route?.data?.title).toBe('Chat BI')
  })

  it('mounts the data container at /data and removes the legacy /models route', () => {
    expect(children.some((item) => item.path === 'data')).toBe(true)
    expect(children.some((item) => item.path === 'models')).toBe(false)
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
