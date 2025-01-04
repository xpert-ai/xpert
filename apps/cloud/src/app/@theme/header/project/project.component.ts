import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog, MatDialogModule } from '@angular/material/dialog'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { computedAsync } from 'ngxtension/computed-async'
import { firstValueFrom } from 'rxjs'
import { map, startWith, switchMap } from 'rxjs/operators'
import { DefaultProject, IProject, ProjectsService, Store, ToastrService } from '../../../@core'
import { InlineSearchComponent } from '../../../@shared/form-fields'
import { ProjectCreationComponent } from './creation/creation.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    MatButtonModule,
    MatDialogModule,
    TranslateModule,
    InlineSearchComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-header-project',
  templateUrl: `./project.component.html`
})
export class ProjectSelectorComponent {
  private _dialog = inject(MatDialog)
  private _toastrService = inject(ToastrService)
  private _router = inject(Router)
  private projectService = inject(ProjectsService)
  private translateService = inject(TranslateService)
  readonly store = inject(Store)

  form = new FormGroup({
    name: new FormControl(null, [Validators.required]),
    description: new FormControl(null, [])
  })

  searchControl = new FormControl('')

  readonly selectedOrganizationId = toSignal(this.store.selectedOrganization$.pipe(map((org) => org?.id)))
  readonly projects = computedAsync(() => {
    const orgId = this.selectedOrganizationId()
    return this.projectService.onRefresh().pipe(
      switchMap(() => this.projectService.getMy()),
      map((items) => {
        const defaultName = this.getDefaultProjectName()
        return [
          {
            ...DefaultProject,
            name: defaultName
          },
          ...items
        ]
      }),
      switchMap((items) =>
        this.searchControl.valueChanges.pipe(
          startWith(''),
          map((value) => value?.trim().toLowerCase()),
          map((value) => (value ? items.filter((item) => item.name.toLowerCase().includes(value)) : items))
        )
      )
    )
  })

  readonly project = toSignal(
    this.store.selectedProject$.pipe(
      map(
        (project) =>
          project ?? {
            ...DefaultProject,
            name: this.getDefaultProjectName()
          }
      )
    )
  )

  private deletedSub = this.projectService.deleted$.pipe(takeUntilDestroyed()).subscribe((id) => {
    if (this.store.selectedProject?.id === id) {
      const defaultName = this.getDefaultProjectName()
      // Select default project
      this.selectProject({
        ...DefaultProject,
        name: defaultName
      })
    }
  })

  selectProject(project: IProject) {
    this.store.selectedProject = project
  }

  async createProject() {
    const newProject = await firstValueFrom(this._dialog.open(ProjectCreationComponent, {}).afterClosed())
    if (newProject) {
      const userId = this.store.user.id
      try {
        const project = await firstValueFrom(
          this.projectService.create({
            ...newProject,
            models: newProject.models.map((model) => ({ id: model.id })),
            ownerId: userId
          })
        )
        this.store.selectedProject = project
        this._router.navigate(['/project'])
      } catch (err: any) {
        this._toastrService.error(err.message)
      }
    }
  }

  getDefaultProjectName() {
    return this.translateService.instant('PAC.Project.DefaultProject', { Default: 'Default' })
  }
}
