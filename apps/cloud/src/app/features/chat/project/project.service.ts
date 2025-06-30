import { computed, inject, Injectable, signal } from '@angular/core'
import { injectProjectService } from '@cloud/app/@core'
import { IStorageFile, IXpertProject } from '@cloud/app/@core/types'
import { linkedModel } from '@metad/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { of } from 'rxjs'
import { ChatHomeService } from '../home.service'
import { attrModel } from '@metad/ocap-angular/core'

@Injectable()
export class ProjectService {
  readonly homeService = inject(ChatHomeService)
  readonly projectsService = injectProjectService()

  readonly paramRole = injectParams('name')
  readonly paramId = injectParams('c')

  readonly id = injectParams('id')

  readonly #project = derivedAsync(() =>
    this.id() ? this.projectsService.getById(this.id(), { relations: ['createdBy', 'owner', 'copilotModel', 'xperts', 'attachments'] }) : of(null)
  )

  readonly project = linkedModel<Partial<IXpertProject>>({
    initialValue: null,
    compute: () => this.#project(),
    update: () => {}
  })

  // Attachments
  readonly attachments = signal<{ file?: File; url?: string; storageFile?: IStorageFile }[]>([])
  readonly files = computed(() => this.attachments()?.map(({storageFile}) => storageFile))
  readonly project_attachments = attrModel(this.project, 'attachments')
  
  onAttachCreated(file: IStorageFile) {
    this.projectsService.addAttachments(this.id(), [file.id]).subscribe({
      next: () => {
        this.project_attachments.update((state) => [...state, file])
      },
    })
  }
  onAttachDeleted(fileId: string) {
    this.projectsService.removeAttachment(this.id(), fileId).subscribe({
      next: () => {
        this.project_attachments.update((state) => state.filter((file) => file.id !== fileId))
      }
    })
  }
}
