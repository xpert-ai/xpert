jest.mock('../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
    FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
  },
  Store: class Store {
    hasFeatureEnabled() {
      return true
    }
  }
}))

jest.mock('./common/common.component', () => ({
  ChatCommonAssistantComponent: class ChatCommonAssistantComponent {}
}))

jest.mock('./xpert/xpert.component', () => ({
  ChatXpertComponent: class ChatXpertComponent {}
}))

jest.mock('./chatbi/chatbi.component', () => ({
  ChatBiComponent: class ChatBiComponent {}
}))

jest.mock('./clawxpert/clawxpert.component', () => ({
  ClawXpertComponent: class ClawXpertComponent {}
}))

jest.mock('./clawxpert/clawxpert-overview.component', () => ({
  ClawXpertOverviewComponent: class ClawXpertOverviewComponent {}
}))

jest.mock('./clawxpert/clawxpert-conversation-detail.component', () => ({
  ClawXpertConversationDetailComponent: class ClawXpertConversationDetailComponent {}
}))

jest.mock('./tasks/tasks.component', () => ({
  ChatTasksComponent: class ChatTasksComponent {}
}))

jest.mock('./projects/projects.component', () => ({
  ChatProjectsComponent: class ChatProjectsComponent {}
}))

jest.mock('./project/home/home.component', () => ({
  ChatProjectHomeComponent: class ChatProjectHomeComponent {}
}))

jest.mock('./project/conversation/conversation.component', () => ({
  ChatProjectConversationComponent: class ChatProjectConversationComponent {}
}))

jest.mock('./project/project.component', () => ({
  ChatProjectComponent: class ChatProjectComponent {}
}))

jest.mock('./home/home.component', () => ({
  ChatHomeComponent: class ChatHomeComponent {}
}))

import { ChatCommonAssistantComponent } from './common/common.component'
import { routes } from './routes'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

describe('chat routes', () => {
  const children = routes[0].children ?? []

  it('routes /chat/x/common to the common assistant component', () => {
    const route = children.find((item) => item.path === 'x/common')

    expect(route?.component).toBe(ChatCommonAssistantComponent)
  })

  it('redirects legacy common conversation urls back to /chat/x/common', () => {
    const route = children.find((item) => item.path === 'x/common/c/:id')

    expect(route?.redirectTo).toBe('/chat/x/common')
  })

  it('keeps /chat/c/:id on the legacy chat xpert component', () => {
    const route = children.find((item) => item.path === 'c/:id')

    expect(route?.component).toBe(ChatXpertComponent)
  })

  it('routes /chat/clawxpert to the ClawXpert page', () => {
    const route = children.find((item) => item.path === 'clawxpert')

    expect(route?.component).toBe(ClawXpertComponent)
    expect(route?.children?.find((item) => item.path === '')?.component).toBe(ClawXpertOverviewComponent)
    expect(route?.children?.find((item) => item.path === 'c/:threadId')?.component).toBe(
      ClawXpertConversationDetailComponent
    )
  })
})
