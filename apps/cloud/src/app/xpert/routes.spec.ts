jest.mock('@xpert-ai/cloud/state', () => ({
  Store: class Store {}
}))

jest.mock('../@core', () => ({
  XpertAPIService: class XpertAPIService {}
}))

jest.mock('./home/home.component', () => ({
  ChatHomeComponent: class ChatHomeComponent {}
}))

import { ChatHomeComponent } from './home/home.component'
import { routes } from './routes'

describe('public xpert routes', () => {
  it('routes /x/:name directly to the public chat page', () => {
    const route = routes.find((item) => item.path === ':name')

    expect(route?.component).toBe(ChatHomeComponent)
    expect(route?.children).toBeUndefined()
  })

  it('routes /x/:name/c/:id directly to the public chat page', () => {
    const route = routes.find((item) => item.path === ':name/c/:id')

    expect(route?.component).toBe(ChatHomeComponent)
  })
})
