import { Component, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IXpertProject } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { Store } from '@cloud/app/@core'
import { debounceTime, distinctUntilChanged } from 'rxjs'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectPipelinePortfolioComponent } from './project-pipeline-portfolio.component'

@Component({
  standalone: true,
  selector: 'xp-project-execution-analysis',
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    XpertProjectPipelinePortfolioComponent
  ],
  providers: [XpertProjectFacade],
  templateUrl: './project-execution-analysis.component.html',
  host: { class: 'block h-full min-w-0' }
})
export class XpertProjectExecutionAnalysisComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly #organizationId = toSignal(inject(Store).selectOrganizationId())
  readonly search = signal('')
  readonly #searchQuery = toSignal(toObservable(this.search).pipe(debounceTime(200), distinctUntilChanged()), {
    initialValue: ''
  })
  readonly status = signal('all')
  readonly skip = signal(0)
  readonly selectedProjects = signal<IXpertProject[]>([])

  constructor() {
    effect(() => {
      this.#organizationId()
      this.selectedProjects.set([])
    })
    effect(() => {
      this.#organizationId()
      this.#searchQuery()
      this.status()
      this.skip.set(0)
      this.facade.projects.set([])
      this.facade.projectsTotal.set(0)
      void this.loadPage(0)
    })
  }

  isSelected(id: string) {
    return this.selectedProjects().some((project) => project.id === id)
  }

  selectProject(project: IXpertProject, checked: boolean) {
    this.selectedProjects.update((projects) => {
      if (!checked) return projects.filter((row) => row.id !== project.id)
      if (projects.length >= 50 || projects.some((row) => row.id === project.id)) return projects
      return [...projects, project]
    })
  }

  setStatus(value: ZardSelectValue | ZardSelectValue[]) {
    if (value === 'all' || value === 'active' || value === 'archived') this.status.set(value)
  }

  page(delta: number) {
    const skip = Math.max(0, this.skip() + delta * 50)
    this.skip.set(skip)
    void this.loadPage(skip)
  }

  private loadPage(skip: number) {
    return this.facade.loadProjects({
      search: this.#searchQuery(),
      status: this.status(),
      sort: 'updated',
      skip,
      take: 50
    })
  }
}
