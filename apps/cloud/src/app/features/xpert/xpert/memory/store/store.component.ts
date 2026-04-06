import { A11yModule } from '@angular/cdk/a11y'
import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { CodeEditorComponent } from '../../../../../@shared/editors'
import {
  CdkConfirmDeleteComponent,
  NgmSearchComponent,
  NgmSpinComponent,
  NgmTableComponent,
  TableColumn
} from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { OverlayAnimation1 } from '@metad/core'
import {
  IXpertMemoryRecord,
  LongTermMemoryTypeEnum,
  DateRelativePipe,
  getErrorMessage,
  injectToastr,
  injectTranslate,
  XpertAPIService
} from '../../../../../@core'
import {
  MemoryAudienceEnum,
  TMemoryAudience,
  TMemoryFileEntry,
  TMemoryFileLayer,
  TMemoryGovernanceAction,
  TMemoryQA,
  TMemoryUserProfile
} from '@metad/contracts'
import { MarkdownModule } from 'ngx-markdown'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY, of, Subscription } from 'rxjs'
import { debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { json2csv } from 'json-2-csv'
import { UserProfileInlineComponent } from '../../../../../@shared/user'
import { XpertComponent } from '../../xpert.component'
import { XpertMemoryBulkImportComponent } from '../bulk-import/bulk-import.component'

type MemoryViewMode = 'records' | 'files'
type MemorySourceMode = 'live' | 'draft'
type AudienceFilter = TMemoryAudience | 'all'
type FileSelection = {
  audience: TMemoryAudience
  ownerUserId?: string
  path: string
}
type EditableMemoryRecord = Partial<IXpertMemoryRecord> & {
  id: string
  kind: LongTermMemoryTypeEnum
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    A11yModule,
    CdkMenuModule,
    MarkdownModule,
    NgxJsonViewerModule,
    NgmSelectComponent,
    NgmTableComponent,
    NgmSpinComponent,
    NgmSearchComponent,
    UserProfileInlineComponent,
    DateRelativePipe,
    CodeEditorComponent
  ],
  selector: 'xp-xpert-memory-store',
  templateUrl: './store.component.html',
  styleUrl: 'store.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryStoreComponent {
  readonly eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum
  readonly eMemoryAudienceEnum = MemoryAudienceEnum

  readonly #translate = inject(TranslateService)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly xpertService = inject(XpertAPIService)
  readonly xpertComponent = inject(XpertComponent)
  readonly #clipboard = inject(Clipboard)

  readonly xpertId = this.xpertComponent.paramId
  readonly latestXpert = this.xpertComponent.latestXpert
  readonly #loading = signal(false)
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly #initializedMemorySourceFor = signal<string | null>(null)

  readonly scoreTemplate = viewChild('scoreTemplate', { read: TemplateRef })
  readonly layerTemplate = viewChild('layerTemplate', { read: TemplateRef })
  readonly statusTemplate = viewChild('statusTemplate', { read: TemplateRef })
  readonly typeTemplate = viewChild('typeTemplate', { read: TemplateRef })
  readonly valueTemplate = viewChild('valueTemplate', { read: TemplateRef })
  readonly userTemplate = viewChild('userTemplate', { read: TemplateRef })
  readonly dateTemplate = viewChild('dateTemplate', { read: TemplateRef })
  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })

  readonly columns = computed(() => {
    const i18n = this.colI18n()
    return [
      {
        name: 'score',
        caption: i18n.Score || 'Score',
        width: '96px',
        cellTemplate: this.scoreTemplate()
      },
      {
        name: 'layerLabel',
        caption: i18n.Layer || 'Layer',
        width: '140px',
        cellTemplate: this.layerTemplate()
      },
      {
        name: 'kind',
        caption: i18n.Type || 'Type',
        width: '96px',
        cellTemplate: this.typeTemplate()
      },
      {
        name: 'status',
        caption: i18n.Status || 'Status',
        width: '110px',
        cellTemplate: this.statusTemplate()
      },
      {
        name: 'title',
        caption: i18n.Title || 'Title',
        width: '220px'
      },
      {
        name: 'value',
        caption: i18n.Value || 'Value',
        cellTemplate: this.valueTemplate()
      },
      {
        name: 'createdBy',
        caption: i18n.CreatedBy || 'Created By',
        width: '180px',
        cellTemplate: this.userTemplate()
      },
      {
        name: 'updatedAt',
        caption: i18n.UpdatedAt || 'Updated At',
        width: '160px',
        cellTemplate: this.dateTemplate()
      },
      {
        name: 'actions',
        caption: i18n.Actions || 'Actions',
        stickyEnd: true,
        width: '180px',
        cellTemplate: this.actionTemplate()
      }
    ] as TableColumn[]
  })

  readonly memoryTypesOptions = [
    {
      value: null,
      label: this.#translate.instant('PAC.Xpert.LongTermMemoryTypeEnum.All', { Default: 'All' })
    },
    {
      value: LongTermMemoryTypeEnum.QA,
      label: this.#translate.instant('PAC.Xpert.LongTermMemoryTypeEnum.QuestionAnswer', { Default: 'Q&A' })
    },
    {
      value: LongTermMemoryTypeEnum.PROFILE,
      label: this.#translate.instant('PAC.Xpert.LongTermMemoryTypeEnum.UserProfile', { Default: 'Profile' })
    }
  ]

  readonly audienceOptions = [
    { value: 'all', label: 'All Layers' },
    { value: MemoryAudienceEnum.USER, label: 'My Memory' },
    { value: MemoryAudienceEnum.SHARED, label: 'Shared Memory' }
  ]

  readonly editorAudienceOptions = [
    { value: MemoryAudienceEnum.USER, label: 'My Memory' },
    { value: MemoryAudienceEnum.SHARED, label: 'Shared Memory' }
  ]

  readonly viewMode = signal<MemoryViewMode>('records')
  readonly memorySource = signal<MemorySourceMode>('live')
  readonly hasDraftMemorySource = computed(() => !!this.latestXpert()?.draft)
  readonly isDraft = computed(() => this.memorySource() === 'draft')
  readonly liveMemoryLabel = computed(() =>
    this.latestXpert()?.publishAt
      ? this.#translate.instant('PAC.Xpert.LiveMemory', { Default: 'Live' })
      : this.#translate.instant('PAC.Xpert.CurrentMemory', { Default: 'Current' })
  )
  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300), startWith('')))
  readonly memoryType = model<LongTermMemoryTypeEnum | null>(LongTermMemoryTypeEnum.PROFILE)
  readonly audience = model<AudienceFilter>('all')
  readonly showArchived = signal(false)
  readonly data = signal<IXpertMemoryRecord[]>([])
  readonly filteredData = computed(() => {
    const keyword = this.search()?.toLowerCase()?.trim()
    if (!keyword) {
      return this.data()
    }
    return this.data().filter((item) =>
      [
        item.title,
        item.kind,
        item.status,
        item.layerLabel,
        item.contentPreview,
        JSON.stringify(item.value),
        item.tags?.join(' ')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    )
  })

  readonly #memories = myRxResource({
    request: () => ({
      xpertId: this.xpertId(),
      type: this.memoryType(),
      includeArchived: this.showArchived(),
      audience: this.audience(),
      isDraft: this.isDraft()
    }),
    loader: ({ request }) =>
      request.xpertId
        ? this.#refresh$.pipe(
            switchMap(() =>
              this.xpertService.getAllMemory(request.xpertId, request.type ? [request.type] : [], {
                includeArchived: request.includeArchived,
                audience: request.audience,
                isDraft: request.isDraft
              })
            ),
            map(({ items }) => items ?? [])
          )
        : of([])
  })

  readonly #files = myRxResource({
    request: () => ({
      xpertId: this.xpertId(),
      isDraft: this.isDraft()
    }),
    loader: ({ request }) =>
      request.xpertId
        ? this.#refresh$.pipe(
            switchMap(() => this.xpertService.getMemoryFiles(request.xpertId, { isDraft: request.isDraft }))
          )
        : of({
            scopeType: 'xpert',
            scopeId: '',
            layers: []
          } as any)
  })

  readonly loading = computed(
    () => this.#memories.status() === 'loading' || this.#files.status() === 'loading' || this.#loading()
  )

  readonly input = model<string>('')
  private searchSub?: Subscription

  readonly showEditor = signal(false)
  readonly editing = signal<EditableMemoryRecord | null>(null)
  readonly editorAudience = model<TMemoryAudience>(MemoryAudienceEnum.SHARED)
  readonly question = model<string>('')
  readonly answer = model<string>('')
  readonly context = model<string>('')
  readonly profile = model<string>('')
  readonly tagsText = model<string>('')
  readonly addMemoryDisabled = computed(() =>
    this.memoryType() === LongTermMemoryTypeEnum.QA
      ? !this.question()?.trim() || !this.answer()?.trim()
      : !this.profile()?.trim()
  )

  readonly fileLayers = computed<TMemoryFileLayer[]>(() => this.#files.value()?.layers ?? [])
  readonly selectedFileRef = signal<FileSelection | null>(null)
  readonly selectedFile = computed<TMemoryFileEntry | null>(() => {
    const selected = this.selectedFileRef()
    if (!selected) {
      return null
    }
    return (
      this.fileLayers()
        .flatMap((layer) => [layer.index, ...layer.files])
        .find(
          (file) =>
            file.audience === selected.audience &&
            file.path === selected.path &&
            (file.ownerUserId ?? '') === (selected.ownerUserId ?? '')
        ) ?? null
    )
  })
  readonly fileContent = model<string>('')
  readonly fileDirty = computed(
    () => !!this.selectedFile() && this.fileContent() !== (this.selectedFile()?.content ?? '')
  )

  readonly memoryRow = (item: EditableMemoryRecord) => item

  constructor() {
    effect(
      () => {
        const xpertId = this.xpertId()
        const xpert = this.latestXpert()
        if (!xpertId || !xpert) {
          return
        }

        if (this.#initializedMemorySourceFor() !== xpertId) {
          this.memorySource.set(xpert.publishAt ? 'live' : this.hasDraftMemorySource() ? 'draft' : 'live')
          this.#initializedMemorySourceFor.set(xpertId)
          return
        }

        if (this.memorySource() === 'draft' && !this.hasDraftMemorySource()) {
          this.memorySource.set('live')
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.data.set(this.#memories.value() ?? [])
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const file = this.selectedFile()
        if (file) {
          this.fileContent.set(file.content)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const layers = this.fileLayers()
        const selected = this.selectedFileRef()
        if (!layers.length) {
          this.selectedFileRef.set(null)
          return
        }

        const exists = selected
          ? layers
              .flatMap((layer) => [layer.index, ...layer.files])
              .some(
                (file) =>
                  file.audience === selected.audience &&
                  file.path === selected.path &&
                  (file.ownerUserId ?? '') === (selected.ownerUserId ?? '')
              )
          : false
        if (!selected || !exists) {
          const firstLayer = layers[0]
          this.selectedFileRef.set({
            audience: firstLayer.index.audience,
            ownerUserId: firstLayer.index.ownerUserId,
            path: firstLayer.index.path
          })
        }
      },
      { allowSignalWrites: true }
    )
  }

  openCreate() {
    this.resetEditor()
    this.editorAudience.set(this.defaultEditorAudience())
    this.showEditor.set(true)
  }

  openEdit(item: EditableMemoryRecord) {
    this.resetEditor()
    this.editing.set(item)
    this.memoryType.set(item.kind)
    this.editorAudience.set(item.audience ?? MemoryAudienceEnum.SHARED)
    if (item.kind === LongTermMemoryTypeEnum.QA) {
      const value = item.value as TMemoryQA | undefined
      this.question.set(value?.question ?? item.title ?? '')
      this.answer.set(value?.answer ?? '')
      this.context.set(value?.context ?? '')
    } else {
      const value = item.value as TMemoryUserProfile | undefined
      this.profile.set(value?.profile ?? '')
      this.context.set(value?.context ?? '')
    }
    this.tagsText.set(item.tags?.join(', ') ?? '')
    this.showEditor.set(true)
  }

  saveMemory() {
    this.#loading.set(true)
    const editing = this.editing()
    const request$ = editing
      ? this.xpertService.updateMemory(
          this.xpertId(),
          editing.id,
          {
            type: this.memoryType(),
            audience: this.editorAudience(),
            ownerUserId: editing.ownerUserId,
            value: this.currentValue(),
            tags: this.currentTags()
          },
          {
            isDraft: this.isDraft()
          }
        )
      : this.xpertService.addMemory(
          this.xpertId(),
          {
            type: this.memoryType(),
            audience: this.editorAudience(),
            value: this.currentValue(),
            tags: this.currentTags()
          },
          {
            isDraft: this.isDraft()
          }
        )

    request$.subscribe({
      next: () => {
        this.#loading.set(false)
        this.closeEditor()
        this.#refresh$.next()
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  saveFile() {
    const selected = this.selectedFile()
    if (!selected) {
      return
    }
    this.#loading.set(true)
    this.xpertService
      .updateMemoryFile(
        this.xpertId(),
        {
          audience: selected.audience,
          ownerUserId: selected.ownerUserId,
          path: selected.path,
          content: this.fileContent()
        },
        {
          isDraft: this.isDraft()
        }
      )
      .subscribe({
        next: () => {
          this.#loading.set(false)
          this.#toastr.success('PAC.ACTIONS.Save', { Default: 'Saved' })
          this.#refresh$.next()
        },
        error: (err) => {
          this.#loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  selectFile(file: TMemoryFileEntry) {
    this.selectedFileRef.set({
      audience: file.audience,
      ownerUserId: file.ownerUserId,
      path: file.path
    })
  }

  isSelectedFile(file: TMemoryFileEntry) {
    const selected = this.selectedFileRef()
    return (
      !!selected &&
      selected.audience === file.audience &&
      selected.path === file.path &&
      (selected.ownerUserId ?? '') === (file.ownerUserId ?? '')
    )
  }

  closeEditor() {
    this.showEditor.set(false)
    this.resetEditor()
  }

  clearMemory() {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          information: this.#translate.instant('PAC.Xpert.ClearAllMemoryOfXpert', {
            Default: 'Archive all memories visible in this xpert'
          })
        }
      })
      .closed.pipe(
        switchMap((confirm) =>
          confirm ? this.xpertService.clearMemory(this.xpertId(), { isDraft: this.isDraft() }) : EMPTY
        )
      )
      .subscribe({
        next: () => this.#refresh$.next(),
        error: (err) => this.#toastr.error(getErrorMessage(err))
      })
  }

  governance(item: EditableMemoryRecord, action: TMemoryGovernanceAction) {
    const run = () =>
      this.xpertService
        .updateMemory(
          this.xpertId(),
          item.id,
          {
            action,
            audience: item.audience,
            ownerUserId: item.ownerUserId
          },
          {
            isDraft: this.isDraft()
          }
        )
        .subscribe({
          next: () => this.#refresh$.next(),
          error: (err) => this.#toastr.error(getErrorMessage(err))
        })

    if (action === 'archive') {
      this.#dialog
        .open(CdkConfirmDeleteComponent, {
          data: {
            value: item.title,
            information: this.#translate.instant('PAC.Xpert.DeleteTheMemory', {
              Default: 'Archive the memory'
            })
          }
        })
        .closed.pipe(tap((confirm) => confirm && run()))
        .subscribe()
      return
    }

    run()
  }

  onSearch() {
    this.#loading.set(true)
    this.searchSub = this.xpertService
      .searchMemory(this.xpertId(), {
        type: this.memoryType(),
        audience: this.audience(),
        text: this.input(),
        isDraft: this.isDraft(),
        includeArchived: this.showArchived(),
        includeFrozen: true,
        limit: 20
      })
      .subscribe({
        next: (results) => {
          this.#loading.set(false)
          this.data.set(results)
        },
        error: (err) => {
          this.#loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  stop() {
    this.#loading.set(false)
    this.searchSub?.unsubscribe()
    this.searchSub = undefined
  }

  resetSearchResults() {
    this.stop()
    this.input.set('')
    this.#refresh$.next()
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing || event.shiftKey) {
        return
      }
      this.onSearch()
      event.preventDefault()
    }
  }

  copyValue(item: Partial<IXpertMemoryRecord>) {
    this.#clipboard.copy(JSON.stringify(item.value, null, 2))
    this.#toastr.success('PAC.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
  }

  copyFile() {
    this.#clipboard.copy(this.fileContent())
    this.#toastr.success('PAC.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
  }

  bulkImport() {
    this.#dialog
      .open(XpertMemoryBulkImportComponent, {
        data: {
          xpertId: this.xpertId(),
          type: this.memoryType() || LongTermMemoryTypeEnum.QA,
          audience: this.audience() === 'all' ? this.defaultEditorAudience() : this.audience(),
          isDraft: this.isDraft()
        }
      })
      .closed.subscribe({
        next: (upload) => {
          if (upload) {
            this.#toastr.success('PAC.Messages.UploadSuccessful', { Default: 'Upload successful' })
            this.#refresh$.next()
          }
        }
      })
  }

  bulkExport() {
    const csvContent = json2csv(
      this.filteredData().map(({ value, title, status, tags, audience, layerLabel }) => ({
        title,
        status,
        audience,
        layerLabel,
        tags: tags?.join(','),
        ...value
      }))
    )
    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (this.memoryType() || 'all') + '-memory-data.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  toggleArchived() {
    this.showArchived.update((value) => !value)
    this.#refresh$.next()
  }

  setViewMode(mode: MemoryViewMode) {
    this.viewMode.set(mode)
  }

  setMemorySource(mode: MemorySourceMode) {
    if (mode === this.memorySource()) {
      return
    }

    this.stop()
    this.memorySource.set(mode)
  }

  private currentValue(): TMemoryQA | TMemoryUserProfile {
    if (this.memoryType() === LongTermMemoryTypeEnum.QA) {
      return {
        question: this.question()?.trim(),
        answer: this.answer()?.trim(),
        ...(this.context()?.trim() ? { context: this.context().trim() } : {})
      }
    }
    return {
      profile: this.profile()?.trim(),
      ...(this.context()?.trim() ? { context: this.context().trim() } : {})
    }
  }

  private currentTags() {
    return this.tagsText()
      ?.split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  private defaultEditorAudience(): TMemoryAudience {
    const audience = this.audience()
    if (audience !== 'all') {
      return audience
    }
    return this.memoryType() === LongTermMemoryTypeEnum.PROFILE ? MemoryAudienceEnum.USER : MemoryAudienceEnum.SHARED
  }

  private resetEditor() {
    this.editing.set(null)
    this.question.set('')
    this.answer.set('')
    this.context.set('')
    this.profile.set('')
    this.tagsText.set('')
  }
}
