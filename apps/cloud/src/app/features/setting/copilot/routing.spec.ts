jest.mock('../../../@core', () => ({
  AIPermissionsEnum: {
    COPILOT_EDIT: 'COPILOT_EDIT'
  }
}))

jest.mock('./copilot.component', () => ({
  CopilotComponent: class CopilotComponent {}
}))

import routes from './routing'

describe('copilot setting routes', () => {
  it('does not expose the examples page', () => {
    const copilotRoute = routes.find((route) => route.path === '')
    const childPaths = copilotRoute?.children?.map((route) => route.path)

    expect(childPaths).not.toContain('examples')
  })
})
