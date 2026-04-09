jest.mock('../../@core', () => ({
  AnalyticsPermissionsEnum: {
    STORIES_EDIT: 'STORIES_EDIT',
    MODELS_EDIT: 'MODELS_EDIT'
  }
}))

import { routes } from './routes'

describe('data routes', () => {
  it('redirects /data to /data/project', () => {
    expect(routes[0]).toMatchObject({
      path: '',
      pathMatch: 'full',
      redirectTo: 'project'
    })
  })

  it('exposes project and models children under /data', () => {
    expect(routes.find((item) => item.path === 'project')?.loadChildren).toEqual(expect.any(Function))
    expect(routes.find((item) => item.path === 'models')?.loadChildren).toEqual(expect.any(Function))
  })
})
