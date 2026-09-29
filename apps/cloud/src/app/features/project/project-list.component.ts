import {
  GENERAL_PROJECT_TYPE,
  resolveI18nText,
  type XpertProjectTypeRef,
  type XpertProjectTypeSummary,
  type I18nObject
} from '@xpert-ai/contracts'
import { navigateProjectEntry } from './project-entry'
import { CommonModule } from '@angular/common'
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  uploadYamlFile,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardSearchInputComponent,
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import type { IXpertProject, IXpertProjectCreateInput } from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { XpertProjectCreateDialogComponent } from './project-create-dialog.component'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectApiService } from './project-api.service'

@Component({
  standalone: true,
  selector: 'xp-project-list',
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardSearchInputComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ...ZardCardImports,
    ...ZardTableImports
  ],
  template: `
    <main class="mx-auto flex w-full max-w-screen-2xl min-w-0 flex-col gap-5 p-4 sm:p-6">
      <header
        class="flex flex-col gap-3 border-b border-divider-subtle pb-5 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.WorkspaceLabel' | translate }}
          </p>
          <h1 class="mt-1 text-2xl font-semibold text-text-primary">{{ 'XP.XProject.WorkspaceTitle' | translate }}</h1>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.WorkspaceSubtitle' | translate }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button z-button zType="outline" zSize="lg" type="button" (click)="openImport()">
            <i class="ri-upload-line mr-1"></i>{{ 'XP.XProject.ImportDSL' | translate }}
          </button>
          <button z-button zType="default" zSize="lg" type="button" (click)="creationMenu.set(!creationMenu())">
            <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.NewProject' | translate }}
          </button>
        </div>
      </header>
      @if (creationMenu()) {
        <nav class="flex flex-wrap gap-2" [attr.aria-label]="'XP.XProject.ProjectType' | translate">
          @for (type of types(); track type.applicationKey + ':' + type.projectTypeKey) {
            <button z-button zType="outline" (click)="openCreate(type)">{{ typeLabel(type) }}</button>
          }
        </nav>
      }
      <section class="flex flex-wrap items-center gap-3">
        <select
          class="rounded-md border border-divider-subtle bg-components-input-bg px-3 py-2 text-sm"
          #applicationFilter
          [attr.aria-label]="'XP.XProject.Application' | translate"
          [value]="applicationKey()"
          (change)="applicationKey.set(applicationFilter.value); projectTypeKey.set('')"
        >
          <option value="">{{ 'XP.XProject.AllApplications' | translate }}</option>
          <option value="__unclassified">{{ 'XP.XProject.Unclassified' | translate }}</option>
          @for (app of applications(); track app.key) {
            <option [value]="app.key">{{ localized(app.title) }}</option>
          }
        </select>
        <select
          class="rounded-md border border-divider-subtle bg-components-input-bg px-3 py-2 text-sm"
          #typeFilter
          [attr.aria-label]="'XP.XProject.ProjectType' | translate"
          [value]="projectTypeKey()"
          (change)="projectTypeKey.set(typeFilter.value)"
        >
          <option value="">{{ 'XP.XProject.AllTypes' | translate }}</option>
          @for (type of filteredTypes(); track type.applicationKey + ':' + type.projectTypeKey) {
            <option [value]="type.projectTypeKey">{{ typeLabel(type) }}</option>
          }
        </select>
        <z-search-input
          class="w-full min-w-0 md:max-w-[360px]"
          zSize="default"
          [value]="search()"
          [placeholder]="'XP.XProject.SearchProjects' | translate"
          [clearLabel]="'XP.XProject.ClearSearch' | translate"
          (valueChange)="search.set($event)"
        />
        <z-segmented
          zSize="sm"
          class="self-start md:self-auto"
          [zAriaLabel]="'XP.XProject.StatusFilter' | translate"
          [zDefaultValue]="status()"
          (zChange)="status.set($event)"
        >
          @for (filter of filters; track filter.value) {
            <z-segmented-item [value]="filter.value" [label]="filter.label | translate"></z-segmented-item>
          }
        </z-segmented>
      </section>
      @if (facade.loading()) {
        <div
          class="rounded-lg border border-divider-subtle bg-components-card-bg px-4 py-10 text-center text-sm text-text-secondary"
        >
          {{ 'XP.XProject.LoadingProjects' | translate }}
        </div>
      } @else if (facade.error()) {
        <div
          class="rounded-lg border border-text-destructive bg-status-error-bg/10 px-4 py-4 text-sm text-text-destructive"
        >
          {{ facade.error() }}
        </div>
      } @else if (!visibleProjects().length) {
        <z-card class="w-full border border-divider-regular bg-components-card-bg shadow-none"
          ><z-card-content class="flex min-h-64 flex-col items-center justify-center gap-3 text-center"
            ><i class="ri-folder-open-line text-3xl text-text-tertiary"></i>
            <p class="font-medium text-text-primary">{{ 'XP.XProject.NoProjects' | translate }}</p>
            <button z-button zType="outline" zSize="sm" type="button" (click)="creationMenu.set(!creationMenu())">
              {{ 'XP.XProject.CreateProject' | translate }}
            </button></z-card-content
          ></z-card
        >
      } @else {
        <z-card class="overflow-hidden border border-divider-regular bg-components-card-bg shadow-none">
          <z-card-content class="p-0"
            ><div class="overflow-x-auto">
              <table z-table zSize="compact" class="w-full min-w-[760px] text-sm">
                <thead z-table-header>
                  <tr z-table-row class="bg-background-default-subtle">
                    <th z-table-head>{{ 'XP.XProject.ProjectColumn' | translate }}</th>
                    <th z-table-head>{{ 'XP.XProject.StatusColumn' | translate }}</th>
                    <th z-table-head>{{ 'XP.XProject.UpdatedColumn' | translate }}</th>
                    <th z-table-head class="text-right">{{ 'XP.XProject.Open' | translate }}</th>
                  </tr>
                </thead>
                <tbody z-table-body>
                  @for (project of visibleProjects(); track project.id) {
                    <tr z-table-row class="hover:bg-background-default-subtle/70">
                      <td z-table-cell>
                        <button
                          class="mb-1 text-xs text-text-tertiary underline-offset-2 hover:underline"
                          (click)="filterProject(project)"
                        >
                          {{ projectLabel(project) }}
                        </button>
                        <a class="flex items-center gap-3" [routerLink]="['/project', project.id]"
                          ><span class="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary"
                            ><i class="ri-share-line"></i></span
                          ><span class="min-w-0"
                            ><span class="block truncate font-medium text-text-primary">{{ project.name }}</span
                            ><span class="block truncate text-xs text-text-tertiary">{{
                              project.description || ('XP.XProject.NoDescription' | translate)
                            }}</span></span
                          ></a
                        >
                      </td>
                      <td z-table-cell>
                        <z-badge zType="outline">{{
                          project.status || ('XP.XProject.StatusActive' | translate)
                        }}</z-badge>
                      </td>
                      <td z-table-cell class="text-text-secondary">{{ formatDate(project.updatedAt) }}</td>
                      <td z-table-cell class="text-right">
                        <button z-button zType="ghost" zSize="sm" (click)="openApplication(project)">
                          {{ 'XP.XProject.Open' | translate }} <i class="ri-arrow-right-line ml-1"></i>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table></div
          ></z-card-content>
        </z-card>
      }
      <div class="flex items-center justify-end gap-3 text-sm text-text-secondary">
        <button z-button zType="outline" [disabled]="skip() === 0 || facade.loading()" (click)="page(-1)">
          {{ 'XP.XProject.PreviousPage' | translate }}
        </button>
        <span
          >{{ visibleProjects().length ? skip() + 1 : 0 }}–{{ skip() + visibleProjects().length }} /
          {{ facade.projectsTotal() }}</span
        >
        <button
          z-button
          zType="outline"
          [disabled]="skip() + 50 >= facade.projectsTotal() || facade.loading()"
          (click)="page(1)"
        >
          {{ 'XP.XProject.NextPage' | translate }}
        </button>
      </div>
    </main>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectListComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #dialog = inject(ZardDialogService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly #api = inject(XpertProjectApiService)
  readonly #translate = inject(TranslateService)
  readonly types = signal<XpertProjectTypeSummary[]>([])
  readonly creationMenu = signal(false)
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
    status: this.status(),
    applicationKey: this.applicationKey() === '__unclassified' ? undefined : this.applicationKey(),
    projectTypeKey: this.projectTypeKey(),
    unclassified: this.applicationKey() === '__unclassified'
  }))
  constructor() {
    effect((onCleanup) => {
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
  formatDate(value?: Date | string) {
    return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—'
  }
  async openCreate(type: XpertProjectTypeRef = GENERAL_PROJECT_TYPE) {
    this.creationMenu.set(false)
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
      this.#dialog.open<XpertProjectCreateDialogComponent, undefined, IXpertProjectCreateInput>(
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
