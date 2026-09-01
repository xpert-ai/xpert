import { TestBed } from '@angular/core/testing'
import type { IXpertProjectTask } from '@xpert-ai/contracts'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import {
  XpertProjectTaskDialogComponent,
  type XpertProjectTaskDialogData,
  type XpertProjectTaskDialogResult
} from './project-task-dialog.component'

describe('XpertProjectTaskDialogComponent conversation targets', () => {
  const dialogRef = { close: jest.fn() }
  const task = { id: 'task-1', assigneeXpertId: 'xpert-assignee' } as IXpertProjectTask

  beforeEach(() => {
    dialogRef.close.mockReset()
    TestBed.configureTestingModule({
      providers: [
        { provide: ZardDialogRef, useValue: dialogRef },
        {
          provide: Z_MODAL_DATA,
          useValue: {
            task,
            relations: { conversations: [], executions: [] },
            plans: [],
            advanced: false
          } satisfies XpertProjectTaskDialogData
        }
      ]
    })
  })

  it('keeps the execution Xpert and normalized thread id', () => {
    const component = TestBed.runInInjectionContext(() => new XpertProjectTaskDialogComponent())

    component.openConversation('conversation-1', ' thread-1 ', 'xpert-execution')

    expect(dialogRef.close).toHaveBeenCalledWith({
      openConversation: {
        conversationId: 'conversation-1',
        threadId: 'thread-1',
        xpertId: 'xpert-execution'
      }
    } satisfies XpertProjectTaskDialogResult)
  })

  it('falls back to the assigned Xpert for legacy task history', () => {
    const component = TestBed.runInInjectionContext(() => new XpertProjectTaskDialogComponent())

    component.openConversation('conversation-1', 'thread-1')

    expect(dialogRef.close.mock.calls[0][0].openConversation.xpertId).toBe('xpert-assignee')
  })
})
