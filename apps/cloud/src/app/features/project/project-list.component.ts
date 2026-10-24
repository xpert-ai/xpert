import { Dialog } from '@angular/cdk/dialog'
import {
  GENERAL_PROJECT_TYPE,
  resolveI18nText,
  type XpertProjectTypeRef,
  type XpertProjectTypeSummary,
  type I18nObject
} from '@xpert-ai/contracts'
import { navigateProjectEntry } from './project-entry'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  uploadYamlFile,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardMenuImports,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import type { IXpertProject, IXpertProjectCreateInput } from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr, Store } from '@cloud/app/@core'
import { XpertProjectCreateDialogComponent } from './project-create-dialog.component'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectApiService, type XpertProjectListQuery } from './project-api.service'

@Component({
  standalone: true,
  selector: 'xp-project-list',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardMenuImports,
    ...ZardSelectImports,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent
  ],
  templateUrl: './project-list.component.html',
  providers: [XpertProjectFacade],
  host: { class: 'block h-full w-full min-w-0' }
})
export class XpertProjectListComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #organizationId = toSignal(inject(Store).selectOrganizationId())
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly #api = inject(XpertProjectApiService)
  readonly #translate = inject(TranslateService)
  readonly types = signal<XpertProjectTypeSummary[]>([])
  readonly filtersOpen = signal(false)
  readonly sort = signal<NonNullable<XpertProjectListQuery['sort']>>('updated')
  readonly projectGroups = computed(() =>
    [
      {
        key: 'active',
        label: 'XP.XProject.StatusActive',
        projects: this.visibleProjects().filter((project) => !['archived', 'deprecated'].includes(project.status))
      },
      {
        key: 'archived',
        label: 'XP.XProject.StatusArchived',
        projects: this.visibleProjects().filter((project) => project.status === 'archived')
      },
      {
        key: 'deprecated',
        label: 'XP.XProject.ListView.Deprecated',
        projects: this.visibleProjects().filter((project) => project.status === 'deprecated')
      }
    ].filter((group) => group.projects.length)
  )
  readonly hasFilters = computed(() =>
    Boolean(this.applicationKey() || this.projectTypeKey() || this.status() !== 'all')
  )
  readonly applicationKey = signal('')
  readonly projectTypeKey = signal('')
  readonly skip = signal(0)
  readonly applications = computed(() =>
    Array.from(
      new Map(
        this.types().map((type) => [type.applicationKey, { key: type.applicationKey, title: type.applicationTitle }])
      ).values()
    )
  )
  readonly filteredTypes = computed(() => this.types().filter((type) => type.applicationKey === this.applicationKey()))
  readonly search = signal('')
  readonly status = signal('all')
  readonly filters = [
    { label: 'XP.XProject.StatusAll', value: 'all' },
    { label: 'XP.XProject.StatusActive', value: 'active' },
    { label: 'XP.XProject.StatusArchived', value: 'archived' }
  ]
  readonly visibleProjects = this.facade.projects
  readonly query = computed(() => ({
    search: this.search(),
    sort: this.sort(),
    status: this.status(),
    applicationKey: this.applicationKey() === '__unclassified' ? undefined : this.applicationKey(),
    projectTypeKey: this.projectTypeKey(),
    unclassified: this.applicationKey() === '__unclassified'
  }))
  constructor() {
    effect(() => {
      this.#organizationId()
      this.facade.projects.set([])
      this.facade.projectsTotal.set(0)
    })
    effect((onCleanup) => {
      this.#organizationId()
      const query = this.query()
      this.skip.set(0)
      const timer = setTimeout(() => void this.facade.loadProjects({ ...query, take: 50 }), 200)
      onCleanup(() => clearTimeout(timer))
    })
  }
  ngOnInit() {
    firstValueFrom(this.#api.types())
      .then((catalog) => this.types.set(catalog.items))
      .catch((error) => this.#toastr.error(getErrorMessage(error)))
  }
  localized(text: string | I18nObject) {
    return resolveI18nText(text, this.#translate.currentLang)
  }
  typeLabel(type: XpertProjectTypeSummary) {
    return `${this.localized(type.applicationTitle)} / ${this.localized(type.title)}`
  }
  projectLabel(project: IXpertProject) {
    const type = this.types().find(
      (type) => type.applicationKey === project.applicationKey && type.projectTypeKey === project.projectTypeKey
    )
    if (type) return this.typeLabel(type)
    const snapshot = project.projectTypeSnapshot
    return snapshot
      ? `${this.localized(snapshot.applicationTitle)} / ${this.localized(snapshot.title)}`
      : project.applicationKey
        ? `${project.applicationKey} / ${project.projectTypeKey}`
        : this.#translate.instant('XP.XProject.Unclassified')
  }
  filterProject(project: IXpertProject) {
    this.applicationKey.set(project.applicationKey ?? '__unclassified')
    this.projectTypeKey.set(project.projectTypeKey ?? '')
  }
  page(delta: number) {
    this.skip.update((value) => Math.max(0, value + delta * 50))
    void this.facade.loadProjects({ ...this.query(), skip: this.skip(), take: 50 })
  }
  openExecutionAnalysis() {
    return this.#router.navigate(['/project', 'execution-analysis'])
  }
  async openApplication(project: IXpertProject) {
    if (!project.applicationKey || !project.projectTypeKey) return this.#router.navigate(['/project', project.id])
    try {
      return await navigateProjectEntry(
        this.#router,
        await firstValueFrom(
          this.#api.typeEntry(
            { applicationKey: project.applicationKey, projectTypeKey: project.projectTypeKey },
            { projectId: project.id }
          )
        )
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      return false
    }
  }
  setSort(value: ZardSelectValue | ZardSelectValue[]) {
    if (value === 'updated' || value === 'created' || value === 'name') this.sort.set(value)
  }
  setApplication(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value !== 'string') return
    this.applicationKey.set(value === '__all' ? '' : value)
    this.projectTypeKey.set('')
  }
  setProjectType(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.projectTypeKey.set(value === '__all' ? '' : value)
  }
  resetFilters() {
    this.search.set('')
    this.applicationKey.set('')
    this.projectTypeKey.set('')
    this.status.set('all')
  }
  projectStatusKey(project: IXpertProject) {
    return project.status === 'archived'
      ? 'XP.XProject.StatusArchived'
      : project.status === 'deprecated'
        ? 'XP.XProject.ListView.Deprecated'
        : 'XP.XProject.StatusActive'
  }
  formatDate(value?: Date | string) {
    return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—'
  }
  async openCreate(type: XpertProjectTypeRef = GENERAL_PROJECT_TYPE) {
    try {
      const entry = await firstValueFrom(this.#api.typeEntry(type))
      if (entry.kind === 'assistant') {
        await navigateProjectEntry(this.#router, entry)
        return
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      return
    }

    firstValueFrom(
      this.#dialog.open<IXpertProjectCreateInput, undefined, XpertProjectCreateDialogComponent>(
        XpertProjectCreateDialogComponent,
        {
          width: 'min(94vw, 600px)',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog'
        }
      ).closed
    ).then(async (input) => {
      if (!input) return
      try {
        const project = await this.facade.createProject({ ...input, projectType: type })
        await this.#router.navigate(['/project', project.id])
      } catch (error) {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
  openImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml,.yml,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      uploadYamlFile<unknown>(file)
        .then((dsl) => firstValueFrom(this.#api.importDsl(dsl)))
        .then(async (project) => {
          await this.facade.loadProjects()
          await this.#router.navigate(['/project', project.id])
        })
        .catch((error) => this.#toastr.error(getErrorMessage(error)))
    }
    input.click()
  }
}
