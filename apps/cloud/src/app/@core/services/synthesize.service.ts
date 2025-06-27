import { inject, Injectable, signal } from '@angular/core'
import { StoredMessage } from '@langchain/core/messages'
import { TranslateService } from '@ngx-translate/core'
import { Subscription } from 'rxjs'
import { getErrorMessage, IChatMessage } from '../types'
import { ChatService } from './chat.service'
import { TtsStreamPlayerService } from './stream-player.service'
import { ToastrService } from './toastr.service'

@Injectable()
export class SynthesizeService {
  readonly #playerService = inject(TtsStreamPlayerService)
  readonly isPlaying = this.#playerService.isPlaying
  readonly #toastr = inject(ToastrService)
  readonly chatService = inject(ChatService)
  readonly #translate = inject(TranslateService)


  private synthesizeSub: Subscription
  readonly synthesizeLoading = signal(false)
  readAloud(id: string, message: IChatMessage) {
    if (this.synthesizeLoading() || this.isPlaying()) {
      this.synthesizeSub?.unsubscribe()
      this.synthesizeSub = null
      this.synthesizeLoading.set(false)
      this.#playerService.stop().catch((error) => {
        this.#toastr.error(getErrorMessage(error))
      })
    } else {
      this.synthesizeLoading.set(true)
      this.synthesizeSub?.unsubscribe()
      this.synthesizeSub = this.chatService.synthesize(id, message.id, { draft: true }).subscribe({
        next: (event) => {
          if (event.event === 'error') {
            this.#toastr.error(event.data)
            this.synthesizeSub = null
            this.synthesizeLoading.set(false)
            return
          }
          if (event.data.startsWith(':')) {
            // Ignore non-data events
            return
          }

          if (event.data) {
            try {
              const message = JSON.parse(event.data) as StoredMessage
              const audioContent = message.data.content?.[0] as any
              if (audioContent.type !== 'audio') {
                this.#toastr.error(
                  this.#translate.instant('PAC.Chat.PreviewReadAloudError', {
                    Default: 'Read aloud only supports audio messages'
                  })
                )
                return
              }

              this.#playerService.enqueueChunk(audioContent.data)
            } catch (error) {
              this.#toastr.error(getErrorMessage(error))
            }
          }
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
          this.synthesizeSub = null
          this.synthesizeLoading.set(false)
        },
        complete: () => {
          this.synthesizeSub = null
          this.synthesizeLoading.set(false)
        }
      })
    }
  }
}
