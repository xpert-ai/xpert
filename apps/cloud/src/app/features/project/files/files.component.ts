import { animate, state, style, transition, trigger } from '@angular/animations'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, map, switchMap } from 'rxjs'
import { IStorageFile, ProjectsService, Store, ToastrService } from '../../../@core'
import { InlineSearchComponent } from '../../../@shared/form-fields'
import { ProjectComponent } from '../project/project.component'
import { MaterialModule } from '../../../@shared/material.module'
import { userLabel } from '../../../@shared/pipes'
import { ProjectFilesDialogComponent } from '../../../@shared/project'
import { UserRoleSelectComponent, UserProfileComponent, UserProfileInlineComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    TranslateModule,
    UserRoleSelectComponent,
    InlineSearchComponent,
    UserProfileComponent,
    UserProfileInlineComponent,
    ButtonGroupDirective,
    DensityDirective,
    AppearanceDirective,
    NgmTableComponent
  ],
  selector: 'pac-project-files',
  templateUrl: 'files.component.html',
  styleUrl: 'files.component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class ProjectFilesComponent {
  userLabel = userLabel

  // Injectors
  private projectService = inject(ProjectsService)
  private projectComponent = inject(ProjectComponent)
  private store = inject(Store)
  private _dialog = inject(MatDialog)
  private _toastrService = inject(ToastrService)

  searchControl = new FormControl()

  get isOwner() {
    return this.store.user?.id === this.project()?.ownerId
  }

  public readonly refresh$ = new BehaviorSubject<void>(null)

  readonly project = this.projectComponent.projectSignal
  readonly projectId = toSignal(this.projectComponent.projectId$)

  readonly files = signal([])

  readonly columnsToDisplay = [
    { name: 'originalName', label: 'Original Name' },
    { name: 'mimetype', label: 'Mimetype' },
    { name: 'size', label: 'Size' },
    { name: 'encoding', label: 'Encoding' },
    { name: 'createdAt', label: 'Created At' },
    { name: 'createdByUser', label: 'Created by User' }
  ]
  readonly columnsToDisplayWithExpand = [...this.columnsToDisplay.map(({name}) => name), 'expand']
  expandedElement: IStorageFile[] | null

  #projectFilesSub = this.refresh$
    .pipe(
      switchMap(() =>
        this.projectComponent.projectId$.pipe(
          switchMap((id) => this.projectService.getOne(this.projectId(), ['files', 'files.createdBy'])),
          map((project) => project.files)
        )
      )
    )
    .subscribe((files) => {
      this.files.set(
        files.map((file) => ({
          ...file,
          createdByUser: userLabel(file.createdBy)
        }))
      )
    })

  openMaterials() {
    this._dialog
      .open(ProjectFilesDialogComponent, {
        panelClass: 'medium',
        data: {
          projectId: this.projectId()
        }
      })
      .afterClosed()
      .subscribe((result) => {
        this.refresh$.next()
      })
  }

  isImage(file: IStorageFile) {
    return file.mimetype?.startsWith('image')
  }
}
