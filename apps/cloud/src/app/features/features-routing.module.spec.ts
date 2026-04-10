jest.mock('../@core', () => ({
  AnalyticsPermissionsEnum: {
    STORIES_VIEW: 'STORIES_VIEW',
    STORIES_EDIT: 'STORIES_EDIT',
    MODELS_EDIT: 'MODELS_EDIT',
    INDICATOR_MARTKET_VIEW: 'INDICATOR_MARTKET_VIEW'
  },
  authGuard: jest.fn()
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

import { routes } from './features-routing.module'

describe('features routing', () => {
  const children = routes[0].children ?? []

  it('mounts chat projects at the top-level /project route', () => {
    const route = children.find((item) => item.path === 'project')

    expect(route?.loadChildren).toEqual(expect.any(Function))
  })

  it('mounts the data container at /data and removes the legacy /models route', () => {
    expect(children.some((item) => item.path === 'data')).toBe(true)
    expect(children.some((item) => item.path === 'models')).toBe(false)
  })
})
