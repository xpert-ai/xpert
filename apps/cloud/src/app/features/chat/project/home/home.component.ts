import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  DateRelativePipe,
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IStorageFile,
  IXpertProject,
  IXpertWorkspace,
  OrderTypeEnum,
  TXpertProjectSettings,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ChatAttachmentsComponent } from '@cloud/app/@shared/chat'
import { CopilotEnableModelComponent, CopilotPromptGeneratorComponent } from '@cloud/app/@shared/copilot'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { attrModel, FileTypePipe, linkedModel, TranslatePipe } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, catchError, EMPTY, map, of, switchMap, tap } from 'rxjs'
import { ChatProjectConversationsComponent } from '../conversations/conversations.component'
import { ChatProjectKnowledgesComponent } from '../knowledges/knowledges.component'
import { ChatProjectManageComponent } from '../manage/manage.component'
import { ChatProjectComponent } from '../project.component'
import { ChatProjectToolsComponent } from '../tools/tools.component'
import { ChatProjectXpertsComponent } from '../xperts/xperts.component'
import { ProjectService } from '../project.service'
import { ChatProjectFilesComponent } from '../files/files.component'
import { FileIconComponent } from '@cloud/app/@shared/files'

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

    FileTypePipe,
    DateRelativePipe,
    CopilotEnableModelComponent,
    ChatProjectXpertsComponent,
    ChatProjectToolsComponent,
    ChatProjectFilesComponent,
    ChatProjectConversationsComponent,
    ChatProjectKnowledgesComponent,
    ChatAttachmentsComponent,
    FileIconComponent
  ],
  selector: 'pac-chat-project-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectHomeComponent {
  readonly #logger = inject(NGXLogger)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #fb = inject(FormBuilder)
  readonly #projectsService = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly projectService = inject(ProjectService)
  readonly i18nService = injectI18nService()
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()

  readonly id = injectParams('id')

  readonly project = this.#projectComponent.project

  readonly avatar = attrModel(this.project, 'avatar')
  readonly name = attrModel(this.project, 'name')
  readonly settings = attrModel(this.project, 'settings')
  readonly project_attachments = attrModel(this.project, 'attachments')
  readonly instruction = attrModel(this.settings, 'instruction')
  readonly mode = attrModel(this.settings, 'mode')

  // Toolsets
  readonly #toolsRefresh$ = new BehaviorSubject<void>(null)
  readonly #toolsets = derivedAsync(() =>
    this.id()
      ? this.#toolsRefresh$.pipe(
          switchMap(() => this.#projectsService.getToolsets(this.id(), { relations: ['createdBy'] }))
        )
      : of(null)
  )
  readonly toolsets = linkedModel({
    initialValue: null,
    compute: () => this.#toolsets()?.items,
    update: () => {}
  })

  // Knowledgebases
  readonly #kbRefresh$ = new BehaviorSubject<void>(null)
  readonly #knowledgebases = derivedAsync(() =>
    this.id()
      ? this.#kbRefresh$.pipe(
          switchMap(() => this.#projectsService.getKnowledgebases(this.id(), { relations: ['createdBy'] }))
        )
      : of(null)
  )
  readonly knowledgebases = linkedModel({
    initialValue: null,
    compute: () => this.#knowledgebases()?.items,
    update: () => {}
  })

  // View
  readonly viewType = signal<'files' | 'tools' | 'knowledges' | 'conversations'>('tools')

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
  readonly #workspace = derivedAsync<{ workspace?: IXpertWorkspace; error?: string }>(() =>
    this.workspaceId()
      ? this.workspaceService.getById(this.workspaceId()).pipe(
          map((workspace) => ({ workspace })),
          catchError(() =>
            of({
              error: this.i18nService.translate('PAC.XProject.NoAccessWorkspace', { Default: 'No access to workspace' })
            })
          )
        )
      : of(null)
  )
  readonly workspace = computed(() => this.#workspace()?.workspace)
  readonly workspaceError = computed(() => this.#workspace()?.error)

  // Attachments
  readonly attachments = this.projectService.attachments
  
  constructor() {
    effect(() => {
      //
    })
  }

  openWorkspace() {
    if (this.workspace()) {
      window.open(`/xpert/w/${this.workspace().id}`, '_blank')
    }
  }

  updateProject(project: Partial<IXpertProject>) {
    return this.#projectsService.update(this.id(), project)
  }

  saveProject() {
    this.loading.set(true)
    this.updateProject({
      avatar: this.avatar(),
      name: this.name()
    }).subscribe({
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

  edit() {
    this.editing.set(true)
  }

  cancelEdit() {
    this.editing.set(false)
  }

  updateMode() {
    this.loading.set(true)
    this.updateProject({
      settings: { ...(this.settings() ?? {}), mode: this.mode() } as TXpertProjectSettings
    }).subscribe({
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
            return this.updateProject({ settings: { ...(this.settings() ?? {}), instruction } }).pipe(
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

  manage() {
    this.#dialog
      .open(ChatProjectManageComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          id: this.project().id
        }
      })
      .closed.subscribe(() => {})
  }

  exportDsl() {
    this.#projectsService.exportDsl(this.id()).subscribe({
      next: (result) => {
        const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `project-${this.project().name}.yaml`
        a.click()
        window.URL.revokeObjectURL(url)
      }
    })
  }

  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }
  /**
   * on file drop handler
   */
  async onFileDropped(event: FileList) {
    const filesArray = Array.from(event)
    this.attachments.update((state) => [...state, ...filesArray.map((file) => ({ file }))])
  }

  onAttachCreated(file: IStorageFile) {
    this.projectService.onAttachCreated(file)
  }
  onAttachDeleted(fileId: string) {
    this.projectService.onAttachDeleted(fileId)
  }
  addAttachment(file: IStorageFile) {
    this.attachments.update((state) => {
      if (!state?.some((attachment) => attachment.storageFile?.id === file.id)) {
        return [...state, {storageFile: file}]
      }
      return state
    })
  }
}
