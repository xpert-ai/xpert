const mockChatBiGuard = jest.fn()

jest.mock('../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI'
  }
}))

jest.mock('../feature-gate', () => ({
  featureGate: jest.fn(() => mockChatBiGuard)
}))

jest.mock('./chatbi.component', () => ({
  ChatBiComponent: class ChatBiComponent {}
}))

import { routes } from './routes'
import { ChatBiComponent } from './chatbi.component'

const { featureGate } = jest.requireMock('../feature-gate') as {
  featureGate: jest.Mock
}

describe('chatbi routes', () => {
  it('mounts ChatBI as an independent feature root', () => {
    const route = routes[0]

    expect(route.path).toBe('')
    expect(route.component).toBe(ChatBiComponent)
    expect(route.canActivate).toEqual([mockChatBiGuard])
    expect(route.data?.title).toBe('Chat BI')
    expect(featureGate).toHaveBeenCalledWith(['FEATURE_XPERT', 'FEATURE_XPERT_CHATBI'])
  })
})
