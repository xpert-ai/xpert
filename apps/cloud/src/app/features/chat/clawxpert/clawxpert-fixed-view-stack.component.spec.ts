import { TestBed } from '@angular/core/testing'
import { ClawXpertFixedViewStackComponent } from './clawxpert-fixed-view-stack.component'

describe('fixed View conversation context', () => {
  it('retains the authorized group runtime when the host holds a group thread or private conversation', () => {
    TestBed.overrideComponent(ClawXpertFixedViewStackComponent, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(ClawXpertFixedViewStackComponent)
    fixture.componentRef.setInput('runtimeScope', {
      groupId: 'group',
      conversationId: 'group-assistant-runtime',
      projectId: null
    })
    fixture.componentRef.setInput('conversationId', 'unrelated-private-conversation')
    expect(fixture.componentInstance.conversationScope()).toEqual({
      groupId: 'group',
      conversationId: 'group-assistant-runtime',
      projectId: null
    })
    fixture.componentRef.setInput('runtimeScope', { projectId: 'project' })
    expect(fixture.componentInstance.conversationScope()).toEqual({
      projectId: 'project',
      conversationId: 'unrelated-private-conversation'
    })
  })
})
