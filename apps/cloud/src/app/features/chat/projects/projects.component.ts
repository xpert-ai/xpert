import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { getErrorMessage, injectProjectService, injectToastr, IXpertProject, OrderTypeEnum } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertProjectInstallComponent } from '@cloud/app/@shared/chat'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { linkedModel, TranslatePipe, uploadYamlFile } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { derivedAsync } from 'ngxtension/derived-async'
import { EMPTY, map, startWith, switchMap } from 'rxjs'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, CdkMenuModule, TranslatePipe, NgmSpinComponent, EmojiAvatarComponent],
  selector: 'pac-chat-projects',
  templateUrl: './projects.component.html',
  styleUrl: 'projects.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectsComponent {
  readonly #router = inject(Router)
  readonly projectSercice = injectProjectService()
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18nService = injectI18nService()
  readonly #dialog = inject(Dialog)

  readonly #projects = derivedAsync<{ projects?: IXpertProject[]; loading: boolean }>(() =>
    this.projectSercice.getAllMy({order: {updatedAt: OrderTypeEnum.DESC}}).pipe(
      map(({ items }) => ({ projects: items, loading: false })),
      startWith({ loading: true })
    )
  )

  readonly projects = linkedModel({
    initialValue: null,
    compute: () => this.#projects()?.projects,
    update: () => {}
  })

  readonly loading = linkedModel({
    initialValue: false,
    compute: () => this.#projects()?.loading,
    update: () => {}
  })

  addProject() {
    this.loading.set(true)
    this.projectSercice.create({ name: 'New Project' }).subscribe({
      next: (project) => {
        this.loading.set(false)
        this.#router.navigate(['/chat/p', project.id])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  removeProject(project: IXpertProject) {
    this.confirmDelete({
      value: project.name,
      information: this.i18nService.instant('PAC.XProject.DeleteProjectAndAll', {
        Default: 'Delete the project and all the materials in it'
      })
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.projectSercice.delete(project.id)
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.projects.update((projects) => projects.filter((_) => _.id !== project.id))
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  duplicateProject(project: IXpertProject) {
    this.projectSercice.duplicate(project.id).subscribe({
      next: (newProject) => {
        this.#router.navigate(['/chat/p', newProject.id])
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  importDsl() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml, .yml'

    input.onchange = (event: any) => {
      const file = event.target.files[0]
      if (file) {
        uploadYamlFile<any>(file)
          .then((parsedDSL) => {
            // Assuming there's a method to handle the parsed DSL
            this.handleImportedDSL(parsedDSL)
          })
          .catch((error) => {
            this.#toastr.error(
              this.i18nService.instant('PAC.Xpert.ImportError', { Default: 'Failed to import DSL file' }) +
                ': ' +
                getErrorMessage(error)
            )
          })
      }
    }

    input.click()
  }
  
  handleImportedDSL(dsl: any) {
    this.#dialog.open<IXpertProject>(XpertProjectInstallComponent, {
      data: {
        dsl
      }
    }).closed.subscribe({
      next: (result) => {
        if (result) {
          this.#router.navigate(['/chat/p', result.id])
        }
      }
    })
  }
}
