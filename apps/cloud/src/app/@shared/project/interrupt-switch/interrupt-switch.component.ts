import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormControl, FormsModule } from '@angular/forms'
import { ProjectAPIService } from '@cloud/app/@core'
import { IProject } from '@metad/cloud/state'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { map, startWith, switchMap } from 'rxjs/operators'
import { AbstractInterruptComponent } from '../../agent'
import { NgmSelectComponent } from '../../common'
import { injectI18nService } from '../../i18n'
import { ProjectCreationComponent } from '../creation/creation.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkListboxModule, NgmSpinComponent, NgmSelectComponent],
  selector: 'xp-project-interrupt-switch',
  templateUrl: 'interrupt-switch.component.html',
  styleUrls: ['interrupt-switch.component.scss']
})
export class ProjectInterruptSwitchComponent extends AbstractInterruptComponent<{ name?: string }, {projectId?: string}> {
  readonly #dialog = inject(Dialog)
  readonly projectAPI = inject(ProjectAPIService)
  readonly i18nService = injectI18nService()

  readonly #projects = myRxResource({
    request: () => ({}),
    loader: () =>
      this.projectAPI.onRefresh().pipe(
        switchMap(() => this.projectAPI.getMy()),
        switchMap((items) =>
          this.searchControl.valueChanges.pipe(
            startWith(''),
            map((value) => value?.trim().toLowerCase()),
            map((value) => (value ? items.filter((item) => item.name.toLowerCase().includes(value)) : items))
          )
        ),
        map((items) => {
          return items.map((item) => ({
            value: item.id,
            label: item.name,
            description: item.description
          }))
        })
      )
  })
  readonly searchControl = new FormControl<string>('')

  readonly types = model<Array<'Select' | 'New'>>(['Select'])

  readonly projects = this.#projects.value
  readonly loading = computed(() => this.#projects.status() === 'loading')
  readonly createdProject = signal<IProject | null>(null)

  readonly projectId = linkedModel({
    initialValue: null,
    compute: () => this.value()?.projectId ?? null,
    update: (value) => {
      this.value.update((state) => ({ ...(state ?? {}), projectId: value }))
    }
  })
  readonly name = computed(() => this.data()?.name)

  readonly TYPES_OPTIONS = ['Select', 'New']

  constructor() {
    super()

    effect(
      () => {
        if (this.name()) {
          this.types.set(['New'])
        }
      },
      { allowSignalWrites: true }
    )
  }

  onNewModel() {
    this.#dialog.open<IProject>(ProjectCreationComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
    }).closed.subscribe((project) => {
      if (project) {
        this.projectId.set(project.id)
        this.createdProject.set(project)
      }
    })
  }
}
