import { IChatConversation } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { PreviewErrorRecovery } from './preview-error-recovery'
import { PreviewConversationLoadState } from './preview-conversation'

describe('preview error reconciliation', () => {
  let current: Partial<IChatConversation>
  beforeEach(() => {
    current = { id: 'conversation', status: 'error' }
  })
  it.each(['interrupted', 'busy', 'idle', 'error'] as const)(
    'restores persisted %s state and messages',
    async (status) => {
      const saved = { id: 'conversation', status, messages: [], operation: { tasks: [] } }
      const recovery = new PreviewErrorRecovery(
        () => current,
        () => of({ conversation: saved, error: null }),
        (value) => {
          current = value
        }
      )
      await recovery.synchronize('Admission rejected')
      expect(current).toEqual({ ...saved, error: 'Admission rejected' })
      expect(recovery.state()).toBe('idle')
    }
  )
  it('offers synchronization retry when the state cannot be read, then restores approval', async () => {
    const load = jest
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(
        of({ conversation: { id: 'conversation', status: 'interrupted', operation: { tasks: [] } }, error: null })
      )
    const recovery = new PreviewErrorRecovery(
      () => current,
      load,
      (value) => {
        current = value
      }
    )
    await recovery.synchronize('offline')
    expect(recovery.state()).toBe('failed')
    await recovery.synchronize('offline')
    expect(current.status).toBe('interrupted')
    expect(recovery.state()).toBe('idle')
  })
  it('does not overwrite a newer request or a switched conversation', async () => {
    const source = new Subject<PreviewConversationLoadState>()
    const restore = jest.fn()
    const recovery = new PreviewErrorRecovery(
      () => current,
      () => source,
      restore
    )
    const pending = recovery.synchronize('old')
    expect(recovery.state()).toBe('syncing')
    recovery.reset()
    current = { id: 'other' }
    source.next({ conversation: { id: 'conversation', status: 'interrupted' }, error: null })
    await pending
    expect(restore).not.toHaveBeenCalled()
  })
})
