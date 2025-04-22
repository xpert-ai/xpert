import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, ViewContainerRef } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { DateRelativePipe, getErrorMessage, injectProjectService, injectToastr, IXpertWorkspace, OrderTypeEnum, XpertWorkspaceService } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { UserPipe } from '@cloud/app/@shared/pipes'
import { attrModel, linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { shareReplay, switchMap, map, tap, of } from 'rxjs'
import { injectParams } from 'ngxtension/inject-params'
import { ChatProjectComponent } from '../project.component'
import { ChatProjectXpertsComponent } from '../xperts/xperts.component'
import { ChatProjectToolsComponent } from '../tools/tools.component'
import { derivedAsync } from 'ngxtension/derived-async'

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
    ChatProjectXpertsComponent,
    ChatProjectToolsComponent
  ],
  selector: 'pac-chat-project-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectHomeComponent {
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #fb = inject(FormBuilder)
  readonly projectSercice = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly #toastr = injectToastr()

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

  readonly #toolsets = derivedAsync(() => this.id() ? this.projectSercice.getToolsets(this.id()) : of(null))
  readonly toolsets = linkedModel({
    initialValue: null,
    compute: () => this.#toolsets()?.items,
    update: () => {}
  })

  // View
  readonly viewType = signal<'attachments' | 'tools' | 'conversations' | 'members'>('attachments')

  readonly form = this.#fb.group({
    input: ''
  })

  readonly input = toSignal(this.form.get('input').valueChanges)

  readonly answering = signal(false)
  readonly isComposing = signal(false)

  // Workspaces
  readonly loading = signal(true)
  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(
      map(({ items }) => items),
      tap(() => this.loading.set(false))
    ),
    { initialValue: null }
  )
  readonly workspaceId = computed(() => this.project()?.workspaceId)
  readonly workspace = derivedAsync(() => this.workspaceId() ? this.workspaceService.getById(this.workspaceId()) : of(null))

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

  addTool() {}

  selectWorkspace(ws: IXpertWorkspace) {
    this.loading.set(true)
    this.projectSercice.update(this.project().id, {workspaceId: ws.id}).subscribe({
      next: () => {
        this.loading.set(false)
        this.project.update((state) => ({...state, workspaceId: ws.id}))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  routeWorkspace() {
    this.viewType.set('tools')
  }
}
