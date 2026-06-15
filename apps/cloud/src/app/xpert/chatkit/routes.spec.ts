jest.mock('../routes', () => ({
  authGuard: jest.fn()
}))

jest.mock('./public-chatkit.component', () => ({
  PublicChatkitComponent: class PublicChatkitComponent {}
}))

import { authGuard } from '../routes'
import { PublicChatkitComponent } from './public-chatkit.component'
import { routes } from './routes'

describe('public ChatKit xpert routes', () => {
  it('routes /chatkit/x/:name to the public ChatKit shell', () => {
    const route = routes.find((item) => item.path === 'x/:name')

    expect(route?.component).toBe(PublicChatkitComponent)
    expect(route?.canActivate).toEqual([authGuard])
  })

  it('routes /chatkit/x/:name/c/:id to the public ChatKit shell with an initial thread', () => {
    const route = routes.find((item) => item.path === 'x/:name/c/:id')

    expect(route?.component).toBe(PublicChatkitComponent)
    expect(route?.canActivate).toEqual([authGuard])
  })
})
