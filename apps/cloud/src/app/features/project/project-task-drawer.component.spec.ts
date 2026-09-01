import type { IXpertProjectTask } from '@xpert-ai/contracts'
import type { XpertProjectConversationTarget } from './project-api.service'
import { XpertProjectTaskDrawerComponent } from './project-task-drawer.component'

describe('XpertProjectTaskDrawerComponent conversation targets', () => {
  it('keeps the execution Xpert when opening a task conversation', () => {
    const component = new XpertProjectTaskDrawerComponent()
    let target: XpertProjectConversationTarget | undefined
    component.conversationOpened.subscribe((event) => (target = event))

    component.openConversation('conversation-1', 'thread-1', 'xpert-execution')

    expect(target).toEqual({
      conversationId: 'conversation-1',
      threadId: 'thread-1',
      xpertId: 'xpert-execution'
    })
  })

  it('falls back to the assigned Xpert for legacy task links', () => {
    const component = new XpertProjectTaskDrawerComponent()
    component.task = { id: 'task-1', assigneeXpertId: 'xpert-assignee' } as IXpertProjectTask
    let target: XpertProjectConversationTarget | undefined
    component.conversationOpened.subscribe((event) => (target = event))

    component.openConversation('conversation-1', 'thread-1')

    expect(target?.xpertId).toBe('xpert-assignee')
  })
})
