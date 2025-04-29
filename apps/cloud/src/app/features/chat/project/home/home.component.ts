import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IXpertProject,
  IXpertWorkspace,
  OrderTypeEnum,
  TXpertProjectSettings,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { CopilotEnableModelComponent, CopilotPromptGeneratorComponent } from '@cloud/app/@shared/copilot'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { attrModel, linkedModel, TranslatePipe } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, catchError, combineLatest, EMPTY, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs'
import { ChatProjectComponent } from '../project.component'
import { ChatProjectToolsComponent } from '../tools/tools.component'
import { ChatProjectXpertsComponent } from '../xperts/xperts.component'
import { ChatProjectMembersComponent } from '../members/members.component'
import { ChatProjectAttachmentsComponent } from '../attachments/attachments.component'
import { ChatProjectConversationsComponent } from '../conversations/conversations.component'

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
    A11yModule,
    CdkMenuModule,
    TextFieldModule,
    MatTooltipModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    TranslatePipe,
    
    CopilotEnableModelComponent,
    ChatProjectXpertsComponent,
    ChatProjectToolsComponent,
    ChatProjectMembersComponent,
    ChatProjectAttachmentsComponent,
    ChatProjectConversationsComponent
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
  readonly i18nService = injectI18nService()
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()

  readonly id = injectParams('id')

  readonly project = this.#projectComponent.project

  readonly avatar = attrModel(this.project, 'avatar')
  readonly name = attrModel(this.project, 'name')
  readonly settings = attrModel(this.project, 'settings')
  readonly instruction = attrModel(this.settings, 'instruction')
  readonly mode = attrModel(this.settings, 'mode')


  readonly #toolsRefresh$ = new BehaviorSubject<void>(null)
  readonly #toolsets = derivedAsync(() => (this.id() ? this.#toolsRefresh$.pipe(switchMap(() => this.projectSercice.getToolsets(this.id(), {relations: ['createdBy']}))) : of(null)))
  readonly toolsets = linkedModel({
    initialValue: null,
    compute: () => this.#toolsets()?.items,
    update: () => {}
  })

  // View
  readonly viewType = signal<'attachments' | 'tools' | 'conversations' | 'members'>('tools')

  readonly form = this.#fb.group({
    input: ''
  })

  readonly input = toSignal(this.form.get('input').valueChanges)

  readonly answering = signal(false)
  readonly isComposing = signal(false)
  readonly editing = signal(false)
  readonly loading = signal(true)

  // Workspaces
  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(
      map(({ items }) => items),
      tap(() => this.loading.set(false))
    ),
    { initialValue: null }
  )
  readonly workspaceId = computed(() => this.project()?.workspaceId)
  readonly #workspace = derivedAsync<{workspace?: IXpertWorkspace; error?: string;}>(() =>
    this.workspaceId() ? this.workspaceService.getById(this.workspaceId()).pipe(
      map((workspace) => ({workspace})),
      catchError(() => of({error: this.i18nService.translate('PAC.XProject.NoAccessWorkspace', {Default: 'No access to workspace'})}))
    ) : of(null)
  )
  readonly workspace = computed(() => this.#workspace()?.workspace)
  readonly workspaceError = computed(() => this.#workspace()?.error)

  // Files
  readonly refreshFiles$ = new BehaviorSubject<void>(null)
  readonly files$ = combineLatest([toObservable(this.id), this.refreshFiles$]).pipe(
    switchMap(([id]) => this.projectSercice.getFiles(id).pipe(
      map((files) => ({files, loading: false})),
      startWith({files: null, loading: true}))
    ),
    shareReplay(1)
  )

  constructor() {
    effect(() => {
      //
    })
  }

  updateProject(project: Partial<IXpertProject>) {
    return this.projectSercice.update(this.id(), project)
  }

  saveProject() {
    this.loading.set(true)
    this.updateProject({ avatar: this.avatar(), name: this.name() }).subscribe({
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
    this.updateProject({ workspaceId: ws.id }).subscribe({
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

  setMode(mode: TXpertProjectSettings['mode']) {
    this.mode.set(mode)
    this.updateMode()
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

  updateMode() {
    this.loading.set(true)
    this.updateProject({settings: { ...(this.settings() ?? {}), mode: this.mode() } as TXpertProjectSettings}).subscribe({
      next: () => {
        this.loading.set(false)
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
      .closed.pipe(
        switchMap((instruction) => {
          if (instruction) {
            this.loading.set(true)
            return this.updateProject({ settings: { ...(this.settings() ?? {}), instruction } })
              .pipe(
                tap(() => {
                  this.loading.set(false)
                  this.instruction.set(instruction)
                })
              )
          }
          return EMPTY
        })
      )
      .subscribe({
        next: (result) => {},
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  refreshTools() {
    this.#toolsRefresh$.next()
  }
}
