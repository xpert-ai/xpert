jest.mock('../../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_COPILOT_MONITORING: 'FEATURE_COPILOT_MONITORING'
  },
  AIPermissionsEnum: {
    COPILOT_EDIT: 'COPILOT_EDIT'
  },
  RequestScopeLevel: {
    TENANT: 'tenant',
    ORGANIZATION: 'organization'
  }
}))

jest.mock('../../feature-gate', () => ({
  hydrateFeatureContext: jest.fn()
}))

jest.mock('./copilot.component', () => ({
  CopilotComponent: class CopilotComponent {}
}))

import routes, { copilotMonitoringGate } from './routing'

describe('copilot setting routes', () => {
  it('does not expose the examples page', () => {
    const copilotRoute = routes.find((route) => route.path === '')
    const childPaths = copilotRoute?.children?.map((route) => route.path)

    expect(childPaths).not.toContain('examples')
  })

  it('guards monitoring routes with the scope-aware copilot monitoring gate', () => {
    const copilotRoute = routes.find((route) => route.path === '')
    const children = copilotRoute?.children ?? []
    const overviewRoute = children.find((route) => route.path === 'overview')
    const usageRoute = children.find((route) => route.path === 'usage')

    ;[overviewRoute, usageRoute].forEach((route) => {
      expect(route).toEqual(
        expect.objectContaining({
          canActivate: expect.arrayContaining([copilotMonitoringGate])
        })
      )
    })
    ;['usages', 'users'].forEach((path) => {
      expect(children.find((route) => route.path === path)).toEqual(
        expect.objectContaining({
          redirectTo: 'usage',
          pathMatch: 'full'
        })
      )
      expect(children.find((route) => route.path === path)?.canActivate).toBeUndefined()
    })
    expect(children.find((route) => route.path === 'basic')?.canActivate).toBeUndefined()
  })
})
