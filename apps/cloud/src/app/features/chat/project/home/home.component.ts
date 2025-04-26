import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import {
  DateRelativePipe,
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IXpertWorkspace,
  OrderTypeEnum,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { CopilotPromptGeneratorComponent } from '@cloud/app/@shared/copilot'
import { I18nService } from '@cloud/app/@shared/i18n'
import { UserPipe } from '@cloud/app/@shared/pipes'
import { attrModel, linkedModel } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { EMPTY, map, of, shareReplay, switchMap, tap } from 'rxjs'
import { ChatProjectComponent } from '../project.component'
import { ChatProjectToolsComponent } from '../tools/tools.component'
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
    NgmSpinComponent,
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
  readonly i18nService = inject(I18nService)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()

  readonly id = injectParams('id')

  readonly project = this.#projectComponent.project

  readonly avatar = attrModel(this.project, 'avatar')
  readonly name = attrModel(this.project, 'name')
  readonly settings = attrModel(this.project, 'settings')
  readonly instruction = attrModel(this.settings, 'instruction')

  // Conversations
  readonly conversations$ = toObservable(this.id).pipe(
    switchMap((id) => this.projectSercice.getConversations(id)),
    map(({ items }) => items),
    shareReplay(1)
  )

  readonly #toolsets = derivedAsync(() => (this.id() ? this.projectSercice.getToolsets(this.id()) : of(null)))
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
  readonly editing = signal(false)

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
  readonly workspace = derivedAsync(() =>
    this.workspaceId() ? this.workspaceService.getById(this.workspaceId()) : of(null)
  )

  constructor() {
    effect(() => {
      // console.log(this.project())
    })
  }

  saveProject() {
    this.loading.set(true)
    this.projectSercice.update(this.id(), { avatar: this.avatar(), name: this.name() }).subscribe({
      next: () => {
        this.loading.set(false)
        this.editing.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

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

  selectWorkspace(ws: IXpertWorkspace) {
    this.loading.set(true)
    this.projectSercice.update(this.project().id, { workspaceId: ws.id }).subscribe({
      next: () => {
        this.loading.set(false)
        this.project.update((state) => ({ ...state, workspaceId: ws.id }))
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

  rename() {
    this.editing.set(true)
  }

  removeProject() {
    this.confirmDelete({
      value: this.name(),
      information: this.i18nService.instant('PAC.XProject.DeleteProjectAndAll', {
        Default: 'Delete the project and all the materials in it'
      })
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.projectSercice.delete(this.id())
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#router.navigate(['/chat/'])
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  openInstruction() {
    this.#dialog
      .open<string>(CopilotPromptGeneratorComponent, {
        panelClass: 'large',
        disableClose: true,
        data: {
          instruction: this.instruction()
        }
      })
      .closed
      .pipe(switchMap((instruction) => {
        if (instruction) {
          this.loading.set(true)
          return this.projectSercice.update(this.id(), {settings: {...(this.settings() ?? {}), instruction}})
            .pipe(
              tap(() => {
                this.loading.set(false)
                this.instruction.set(instruction)
              })
            )
        }
        return EMPTY
      }))
      .subscribe({
        next: (result) => {
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
