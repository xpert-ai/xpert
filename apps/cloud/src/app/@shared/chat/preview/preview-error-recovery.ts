import { signal } from '@angular/core'
import { IChatConversation } from '@xpert-ai/contracts'
import { firstValueFrom, Observable } from 'rxjs'
import { PreviewConversationLoadState } from './preview-conversation'

/** A transport/admission error does not establish the persisted execution state. */
export class PreviewErrorRecovery {
  readonly state = signal<'idle' | 'syncing' | 'failed'>('idle')
  private revision = 0

  constructor(
    private readonly current: () => Partial<IChatConversation> | null,
    private readonly load: (id: string) => Observable<PreviewConversationLoadState>,
    private readonly restore: (conversation: Partial<IChatConversation>) => void
  ) {}

  reset() {
    this.revision++
    this.state.set('idle')
  }

  async synchronize(message: string) {
    const id = this.current()?.id
    const revision = ++this.revision
    if (!id) return
    this.state.set('syncing')
    try {
      const result = await firstValueFrom(this.load(id))
      if (revision !== this.revision || this.current()?.id !== id) return
      if (!result.conversation || result.error) {
        this.state.set('failed')
        return
      }
      this.restore({ ...result.conversation, error: message })
      this.state.set('idle')
    } catch {
      if (revision === this.revision && this.current()?.id === id) this.state.set('failed')
    }
  }
}
