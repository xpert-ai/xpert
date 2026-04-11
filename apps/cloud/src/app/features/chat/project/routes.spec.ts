jest.mock('../projects/projects.component', () => ({
  ChatProjectsComponent: class ChatProjectsComponent {}
}))

jest.mock('./project.component', () => ({
  ChatProjectComponent: class ChatProjectComponent {}
}))

jest.mock('./home/home.component', () => ({
  ChatProjectHomeComponent: class ChatProjectHomeComponent {}
}))

jest.mock('./conversation/conversation.component', () => ({
  ChatProjectConversationComponent: class ChatProjectConversationComponent {}
}))

import { ChatProjectConversationComponent } from './conversation/conversation.component'
import { ChatProjectHomeComponent } from './home/home.component'
import { ChatProjectComponent } from './project.component'
import { ChatProjectsComponent } from '../projects/projects.component'
import { routes } from './routes'

describe('chat project routes', () => {
  it('mounts the project list at /project', () => {
    const route = routes.find((item) => item.path === '')

    expect(route?.component).toBe(ChatProjectsComponent)
  })

  it('keeps the existing project detail route shape under /project/:id', () => {
    const route = routes.find((item) => item.path === ':id')

    expect(route?.component).toBe(ChatProjectComponent)
    expect(route?.children?.find((item) => item.path === '')?.component).toBe(ChatProjectHomeComponent)
    expect(route?.children?.find((item) => item.path === 'c')?.component).toBe(ChatProjectConversationComponent)
    expect(route?.children?.find((item) => item.path === 'c/:c')?.component).toBe(ChatProjectConversationComponent)
    expect(route?.children?.find((item) => item.path === 'x/:name')?.component).toBe(ChatProjectConversationComponent)
    expect(route?.children?.find((item) => item.path === 'x/:name/c/:c')?.component).toBe(
      ChatProjectConversationComponent
    )
  })
})
