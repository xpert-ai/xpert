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
  it('routes /x-chatkit/x/:name to the public ChatKit shell', () => {
    const route = routes.find((item) => item.path === 'x/:name')

    expect(route?.component).toBe(PublicChatkitComponent)
    expect(route?.canActivate).toEqual([authGuard])
  })

  it('routes /x-chatkit/x/:name/c/:id to the public ChatKit shell with an initial thread', () => {
    const route = routes.find((item) => item.path === 'x/:name/c/:id')

    expect(route?.component).toBe(PublicChatkitComponent)
    expect(route?.canActivate).toEqual([authGuard])
  })

  it('routes enterprise H5 URLs to the same full-screen ChatKit shell without the Xpert login guard', () => {
    const rootRoute = routes.find((item) => item.path === 'h5/:platform/:name')
    const conversationRoute = routes.find((item) => item.path === 'h5/:platform/:name/c/:id')

    expect(rootRoute?.component).toBe(PublicChatkitComponent)
    expect(rootRoute?.data?.['channel']).toBe('enterprise-h5')
    expect(rootRoute?.canActivate).toBeUndefined()
    expect(conversationRoute?.component).toBe(PublicChatkitComponent)
    expect(conversationRoute?.data?.['channel']).toBe('enterprise-h5')
    expect(conversationRoute?.canActivate).toBeUndefined()
  })
})
