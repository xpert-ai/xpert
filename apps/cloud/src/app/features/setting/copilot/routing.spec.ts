jest.mock('../../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_COPILOT_MONITORING: 'FEATURE_COPILOT_MONITORING'
  },
  AIPermissionsEnum: {
    COPILOT_EDIT: 'COPILOT_EDIT'
  }
}))

jest.mock('../../feature-gate', () => ({
  featureGate: jest.fn((featureKeys: string[], redirectCommands: string[]) => ({
    featureKeys,
    redirectCommands
  }))
}))

jest.mock('./copilot.component', () => ({
  CopilotComponent: class CopilotComponent {}
}))

import routes from './routing'
import { featureGate } from '../../feature-gate'

describe('copilot setting routes', () => {
  it('does not expose the examples page', () => {
    const copilotRoute = routes.find((route) => route.path === '')
    const childPaths = copilotRoute?.children?.map((route) => route.path)

    expect(childPaths).not.toContain('examples')
  })

  it('guards monitoring child routes with the monitoring feature toggle', () => {
    const copilotRoute = routes.find((route) => route.path === '')
    const children = copilotRoute?.children ?? []
    const monitoringRoutes = ['usages', 'users', 'overview'].map((path) => children.find((route) => route.path === path))

    expect(featureGate).toHaveBeenCalledWith(['FEATURE_COPILOT_MONITORING'], ['/copilot/basic'])
    monitoringRoutes.forEach((route) => {
      expect(route).toEqual(
        expect.objectContaining({
          canActivate: expect.arrayContaining([
            {
              featureKeys: ['FEATURE_COPILOT_MONITORING'],
              redirectCommands: ['/copilot/basic']
            }
          ])
        })
      )
    })
    expect(children.find((route) => route.path === 'basic')?.canActivate).toBeUndefined()
  })
})
