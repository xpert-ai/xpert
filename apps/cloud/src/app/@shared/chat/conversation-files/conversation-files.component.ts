import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FileTypePipe } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { map, of } from 'rxjs'
import {
  ChatConversationService,
  DateRelativePipe,
  injectToastr,
  TFile,
  TFileDirectory,
  XpertProjectService
} from '../../../@core'

export type TFileDirectoryItem = TFileDirectory & {
  expanded?: boolean
}

@Component({
  standalone: true,
  selector: 'chat-conversation-files',
  templateUrl: `conversation-files.component.html`,
  styleUrl: `conversation-files.component.scss`,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    CdkMenuModule,
    TranslateModule,
    NgmSpinComponent,
    DateRelativePipe,
    FileTypePipe
  ]
})
export class ChatConversationFilesComponent {
  readonly #data = inject<{ projectId?: string; conversationId: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #conversation = inject(ChatConversationService)
  readonly #projectService = inject(XpertProjectService)
  readonly #toastr = injectToastr()

  readonly request = signal(this.#data)
  readonly projectId = signal(this.#data.projectId)
  readonly conversationId = signal(this.#data.conversationId)

  readonly #attachments = myRxResource<{ projectId?: string; conversationId: string }, TFileDirectoryItem[]>({
    request: () => this.request(),
    loader: ({ request }) => {
      return request.projectId
        ? this.#projectService.getFiles(request.projectId)
        : request.conversationId
          ? this.#conversation
              .getAttachments(request.conversationId)
              .pipe(map((file) => file as unknown as TFileDirectory[]))
          : of(null)
    }
  })

  readonly attachments = linkedModel({
    initialValue: null,
    compute: () => this.#attachments.value(),
    update: () => {}
  })
  readonly isLoading = computed(() => this.#attachments.status() === 'loading')

  readonly flatAttachments = computed(() => {
    const flatten = (items: TFileDirectoryItem[]): TFileDirectoryItem[] => {
      return items.reduce((acc: TFileDirectoryItem[], item) => {
        acc.push(item)
        if (item.expanded && item.children && item.children.length > 0) {
          acc.push(...flatten(item.children))
        }
        return acc
      }, [])
    }
    return this.attachments() && flatten(this.attachments())
  })

  constructor() {
    effect(() => {
      // console.log(this.attachments())
    })
  }

  preview(file: TFile) {
    this.#dialogRef.close(file)
  }

  download(fileUrl: string) {
    // Check if the URL is available
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl, '_blank')
    } else {
      console.error('No URL available to open.')
    }
  }

  toggleFolder(item: TFileDirectoryItem) {
    if (item.hasChildren) {
      item.expanded = !item.expanded
      this.attachments.update((attachments) => {
        const index = attachments.findIndex((f) => f.fullPath === item.fullPath)
        if (index !== -1) {
          attachments[index] = {
            ...attachments[index],
            expanded: item.expanded
          }
        }
        return [...attachments]
      })
      if (item.expanded && !item.children) {
        this.#projectService.getFiles(this.projectId(), item.fullPath).subscribe({
          next: (files) => {
            this.attachments.update((attachments) => {
              const index = attachments.findIndex((f) => f.fullPath === item.fullPath)
              if (index !== -1) {
                attachments[index].children = files
              } else {
                attachments.push({
                  ...item,
                  children: files
                })
              }
              return [...attachments]
            })
          }
        })
      }
    }
  }

  close() {
    this.#dialogRef.close()
  }
}
