import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, signal, ViewContainerRef } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { DateRelativePipe, injectProjectService } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { UserPipe } from '@cloud/app/@shared/pipes'
import { attrModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { shareReplay, switchMap, map } from 'rxjs'
import { injectParams } from 'ngxtension/inject-params'
import { ChatProjectComponent } from '../project.component'
import { ChatProjectXpertsComponent } from '../xperts/xperts.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TextFieldModule,
    TranslateModule,
    EmojiAvatarComponent,
    UserPipe,
    DateRelativePipe,
    ChatProjectXpertsComponent
  ],
  selector: 'pac-chat-project-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectHomeComponent {
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #router = inject(Router)
  readonly #fb = inject(FormBuilder)
  readonly projectSercice = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)

  readonly id = injectParams('id')

  readonly project = this.#projectComponent.project

  readonly avatar = attrModel(this.project, 'avatar')
  readonly name = attrModel(this.project, 'name')

  // Conversations
  readonly conversations$ = toObservable(this.id).pipe(
    switchMap((id) => this.projectSercice.getConversations(id)),
    map(({items}) => items),
    shareReplay(1)
  )

  // View
  readonly viewType = signal<'attachments' | 'conversations' | 'members'>('attachments')

  readonly form = this.#fb.group({
    input: ''
  })

  readonly input = toSignal(this.form.get('input').valueChanges)

  readonly answering = signal(false)
  readonly isComposing = signal(false)

  constructor() {
    effect(() => {
      // console.log(this.project())
    })
  }

  saveProject() {}

  onSubmit(text?: string) {
    const input = text || this.form.value.input
    if (!input) return
    const projectId = this.id()
    this.#router.navigate(['/chat/p', projectId, 'x', 'common'], { state: { input } })
  }

  stopGenerating() {}

  triggerFun(event: KeyboardEvent) {
    if ((event.isComposing || event.shiftKey) && event.key === 'Enter') {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const text = this.input()?.trim()
      if (text) {
        setTimeout(() => {
          this.onSubmit(text)
        })
      }
      return
    }
  }
  // Input method composition started
  onCompositionStart() {
    this.isComposing.set(true)
  }

  // Input method composition updated
  onCompositionUpdate(event: CompositionEvent) {
    // Update current value
  }

  // Input method composition ended
  onCompositionEnd(event: CompositionEvent) {
    this.isComposing.set(false)
  }
}
