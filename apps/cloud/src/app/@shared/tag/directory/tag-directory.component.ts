import { KnowledgeTagsService } from '../../../@core/services/knowledge-tags.service'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  getTagTargets,
  ITagDirectoryItem,
  ITagXpertUsage,
  ITagKnowledgebaseUsage,
  PermissionsEnum,
  resolveI18nText,
  TagCategoryEnum,
  TagTarget
} from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardSelectImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom, map } from 'rxjs'
import { getErrorMessage, RequestScopeLevel, Store, TagService, ToastrService, XpertAPIService } from '../../../@core'

type StatusFilter = 'all' | 'active' | 'disabled'
type PanelMode = 'edit' | 'usage' | 'disable' | 'enable' | 'delete'

@Component({
  selector: 'xp-tag-directory',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ...ZardFormImports,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardMenuImports,
    ...ZardSelectImports,
    ...ZardTooltipImports
  ],
  templateUrl: './tag-directory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 w-full' }
})
export class TagDirectoryComponent {
  readonly service = inject(TagService)
  readonly store = inject(Store)
  readonly translate = inject(TranslateService)
  private readonly dialog = inject(Dialog)
  private readonly fb = inject(FormBuilder)
  private readonly toastr = inject(ToastrService)
  private readonly xpertService = inject(XpertAPIService)
  readonly scope = toSignal(this.store.selectActiveScope())
  readonly permissions = toSignal(this.store.userRolePermissions$, {
    initialValue: this.store.userRolePermissions ?? []
  })
  readonly language = toSignal(this.translate.onLangChange.pipe(map((event) => event.lang)), {
    initialValue: this.translate.currentLang
  })
  readonly isTenantScope = computed(() => this.scope()?.level === RequestScopeLevel.TENANT)
  readonly canCreate = computed(
    () =>
      (this.scope()?.level === RequestScopeLevel.ORGANIZATION || this.isTenantScope()) &&
      this.permissions()?.some((p) => p.permission === PermissionsEnum.ORG_TAGS_EDIT && p.enabled)
  )
  readonly tags = signal<ITagDirectoryItem[]>([])
  readonly loading = signal(true)
  readonly saving = signal(false)
  readonly error = signal('')
  readonly panelError = signal('')
  readonly search = signal('')
  readonly targetFilter = signal('all')
  readonly sourceFilter = signal('all')
  readonly status = signal<StatusFilter>('all')
  readonly ascending = signal(true)
  readonly selected = signal<ITagDirectoryItem | null>(null)
  readonly mode = signal<PanelMode>('edit')
  private readonly knowledgeTags = inject(KnowledgeTagsService)
  readonly knowledgeUsage = signal<ITagKnowledgebaseUsage[]>([])
  readonly knowledgeUsageTotal = signal(0)
  readonly knowledgeUsageLoading = signal(false)
  readonly knowledgeUsageError = signal('')
  private knowledgeUsageRequest = 0

  readonly xpertUsage = signal<ITagXpertUsage[]>([])
  readonly xpertUsageTotal = signal(0)
  readonly xpertUsageLoading = signal(false)
  readonly xpertUsageError = signal('')
  readonly targets: readonly TagTarget[] = ['knowledgebase', TagCategoryEnum.XPERT]
  readonly hasLegacyTargets = computed(() => {
    const tag = this.selected()
    return tag ? getTagTargets(tag).some((target) => !this.targets.includes(target)) : false
  })
  readonly statusOptions: StatusFilter[] = ['all', 'active', 'disabled']
  readonly panel = viewChild.required<TemplateRef<unknown>>('panel')
  private ref?: DialogRef
  private request = 0
  private usageRequest = 0

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    description: ['', Validators.maxLength(500)],
    targets: this.fb.nonNullable.control<TagTarget[]>([], Validators.required),
    en_US: ['', Validators.maxLength(100)],
    zh_Hans: ['', Validators.maxLength(100)]
  })
  readonly visible = computed(() => {
    const query = this.search().trim().toLocaleLowerCase()
    return this.tags()
      .filter(
        (tag) =>
          (!query ||
            `${tag.name} ${this.displayName(tag)} ${tag.description ?? ''}`.toLocaleLowerCase().includes(query)) &&
          (this.targetFilter() === 'all' || getTagTargets(tag).some((target) => target === this.targetFilter())) &&
          (this.sourceFilter() === 'all' ||
            (this.sourceFilter() === 'org' ? !!tag.organizationId : !tag.organizationId)) &&
          (this.status() === 'all' || (this.status() === 'active' ? tag.isActive !== false : tag.isActive === false))
      )
      .sort(
        (a, b) =>
          (this.displayName(a).localeCompare(this.displayName(b), this.language()) || a.id.localeCompare(b.id)) *
          (this.ascending() ? 1 : -1)
      )
  })

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request++
      this.usageRequest++
      this.ref?.close()
    })
    effect(
      () => {
        this.scope()
        this.resetUsage()
        this.ref?.close()
        this.tags.set([])
        this.sourceFilter.set('all')
        void this.load()
      },
      { allowSignalWrites: true }
    )
  }

  text(key: string) {
    return this.translate.instant(`XP.TagDirectory.${key}`)
  }
  displayName(tag: ITagDirectoryItem) {
    return resolveI18nText(tag.label, this.language()) || tag.name || ''
  }
  targetNames(tag: ITagDirectoryItem) {
    return getTagTargets(tag)
  }
  total(tag: ITagDirectoryItem) {
    return tag.usage.reduce((sum, item) => sum + item.count, 0)
  }
  editable(tag: ITagDirectoryItem) {
    return this.canCreate() && tag.editable
  }
  readOnlyReason(tag: ITagDirectoryItem) {
    if (tag.isSystem) return this.text('SystemReadOnly')
    if (!tag.organizationId && !this.isTenantScope()) return this.text('SharedReadOnly')
    return this.text('PermissionReadOnly')
  }
  count(status: StatusFilter) {
    return this.tags().filter(
      (tag) => status === 'all' || (status === 'active' ? tag.isActive !== false : tag.isActive === false)
    ).length
  }

  async load() {
    const request = ++this.request
    this.loading.set(true)
    this.error.set('')
    try {
      const tags = await firstValueFrom(this.service.getDirectory())
      if (request === this.request) this.tags.set(tags)
    } catch (error) {
      if (request === this.request) this.error.set(getErrorMessage(error))
    } finally {
      if (request === this.request) this.loading.set(false)
    }
  }

  open(mode: PanelMode, tag: ITagDirectoryItem | null = null) {
    if (mode !== 'usage' && (!this.canCreate() || (tag && !this.editable(tag)))) return
    this.ref?.close()
    this.resetUsage()
    this.mode.set(mode)
    this.selected.set(tag)
    this.panelError.set('')
    this.form.reset({
      name: tag?.name ?? '',
      description: tag?.description ?? '',
      targets: tag ? getTagTargets(tag) : [],
      en_US: tag?.label?.en_US ?? '',
      zh_Hans: tag?.label?.zh_Hans ?? ''
    })
    this.ref = this.dialog.open(this.panel(), {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: '95vw',
      maxHeight: '90vh',
      ariaLabel: this.text(mode === 'edit' ? (tag ? 'Edit' : 'Create') : mode)
    })
    const ref = this.ref
    ref.closed.subscribe(() => {
      if (this.ref === ref) this.resetUsage()
    })
    if (mode === 'usage' && tag?.usage.some((usage) => usage.target === 'knowledgebase' && usage.count))
      void this.loadKnowledgeUsage()
    if (mode === 'usage' && tag?.usage.some((usage) => usage.target === TagCategoryEnum.XPERT && usage.count)) {
      void this.loadXpertUsage()
    }
  }

  private resetUsage() {
    this.knowledgeUsageRequest++
    this.knowledgeUsage.set([])
    this.knowledgeUsageTotal.set(0)
    this.knowledgeUsageLoading.set(false)
    this.knowledgeUsageError.set('')
    this.usageRequest++
    this.xpertUsage.set([])
    this.xpertUsageTotal.set(0)
    this.xpertUsageLoading.set(false)
    this.xpertUsageError.set('')
  }

  async loadKnowledgeUsage(more = false) {
    const tag = this.selected()
    if (!tag || this.mode() !== 'usage' || this.knowledgeUsageLoading()) return
    const request = ++this.knowledgeUsageRequest
    const scope = this.scope()
    this.knowledgeUsageLoading.set(true)
    this.knowledgeUsageError.set('')
    try {
      const page = await firstValueFrom(this.knowledgeTags.usage(tag.id, more ? this.knowledgeUsage().length : 0))
      if (request !== this.knowledgeUsageRequest || scope !== this.scope()) return
      this.knowledgeUsage.set(more ? [...this.knowledgeUsage(), ...page.items] : page.items)
      this.knowledgeUsageTotal.set(page.total)
    } catch (error) {
      if (request === this.knowledgeUsageRequest && scope === this.scope())
        this.knowledgeUsageError.set(getErrorMessage(error))
    } finally {
      if (request === this.knowledgeUsageRequest) this.knowledgeUsageLoading.set(false)
    }
  }

  async loadXpertUsage(more = false) {
    const tag = this.selected()
    if (!tag || this.mode() !== 'usage' || this.xpertUsageLoading()) return
    const request = ++this.usageRequest
    const scope = this.scope()
    const skip = more ? this.xpertUsage().length : 0
    this.xpertUsageLoading.set(true)
    this.xpertUsageError.set('')
    try {
      const page = await firstValueFrom(this.xpertService.getTagUsage(tag.id, skip))
      if (request !== this.usageRequest || scope !== this.scope()) return
      this.xpertUsage.set(more ? [...this.xpertUsage(), ...page.items] : page.items)
      this.xpertUsageTotal.set(page.total)
    } catch (error) {
      if (request === this.usageRequest && scope === this.scope()) this.xpertUsageError.set(getErrorMessage(error))
    } finally {
      if (request === this.usageRequest) this.xpertUsageLoading.set(false)
    }
  }

  close() {
    if (!this.saving()) this.ref?.close()
  }
  setTarget(target: TagTarget, checked: boolean) {
    if (!this.targets.includes(target)) return
    // Keep historical targets in the form value while only exposing current choices.
    const targets = this.form.controls.targets
    targets.setValue(
      checked ? [...new Set([...targets.value, target])] : targets.value.filter((value) => value !== target)
    )
    targets.markAsDirty()
  }

  async save() {
    if (this.saving() || !this.canCreate()) return
    const tag = this.selected()
    if (tag && !this.editable(tag)) return
    this.form.markAllAsTouched()
    if (this.form.invalid) {
      this.panelError.set(this.text('InvalidForm'))
      return
    }
    const { en_US, zh_Hans, ...values } = this.form.getRawValue()
    const name = values.name.trim()
    if (
      this.tags().some(
        (item) =>
          (this.isTenantScope() ? !item.organizationId : !!item.organizationId) &&
          item.id !== tag?.id &&
          item.name?.toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      this.panelError.set(this.text('Duplicate'))
      return
    }
    const label =
      en_US.trim() || zh_Hans.trim() ? { en_US: en_US.trim() || name, zh_Hans: zh_Hans.trim() || undefined } : null
    await this.mutate(() =>
      firstValueFrom(
        tag ? this.service.update(tag.id, { ...values, name, label }) : this.service.create({ ...values, name, label })
      )
    )
  }

  async confirm() {
    const tag = this.selected()
    if (!tag || !this.editable(tag) || this.saving()) return
    if (this.mode() === 'delete' && this.total(tag)) return
    await this.mutate(() =>
      firstValueFrom(
        this.mode() === 'delete'
          ? this.service.delete(tag.id)
          : this.service.update(tag.id, { isActive: this.mode() === 'enable' })
      )
    )
  }

  private async mutate(action: () => Promise<unknown>) {
    const scope = this.scope()
    this.saving.set(true)
    this.panelError.set('')
    if (this.ref) this.ref.disableClose = true
    try {
      await action()
      this.service.refresh()
      if (scope === this.scope()) {
        this.ref?.close()
        this.toastr.success('XP.TagDirectory.Saved')
        await this.load()
      }
    } catch (error) {
      if (scope === this.scope()) this.panelError.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
      if (this.ref) this.ref.disableClose = false
    }
  }
}
