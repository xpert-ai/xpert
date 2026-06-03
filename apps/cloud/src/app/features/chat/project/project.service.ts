import { computed, inject, Injectable, signal } from '@angular/core'
import { injectProjectService } from '@cloud/app/@core'
import { IXpertProject } from '@cloud/app/@core/types'
import { getChatStorageFileId, isChatAgentFile, toStorageAttachmentFile, type ChatAgentFile } from '@cloud/app/@shared/chat/attachments/agent-file'
import { linkedModel } from '@xpert-ai/core'
import { attrModel } from '@xpert-ai/ocap-angular/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { of } from 'rxjs'

@Injectable()
export class ProjectService {
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
  readonly attachments = signal<{ file?: File; url?: string; storageFile?: ChatAgentFile }[]>([])
  readonly files = computed(() => this.attachments()?.map(({storageFile}) => storageFile).filter(isChatAgentFile) ?? [])
  readonly project_attachments = attrModel(this.project, 'attachments')

  onAttachCreated(file: ChatAgentFile) {
    const storageFileId = getChatStorageFileId(file)
    if (!storageFileId) {
      return
    }
    this.projectsService.addAttachments(this.id(), [storageFileId]).subscribe({
      next: () => {
        this.project_attachments.update((state) => [...(state ?? []), toStorageAttachmentFile(file)])
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
