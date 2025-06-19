import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { cloneDeep } from 'lodash-es'
import { of } from 'rxjs'
import {
  ChatConversationService,
  DateRelativePipe,
  injectToastr,
  TFile,
  TFileDirectory,
  XpertProjectService
} from '../../../@core'
import { FileIconComponent } from '../../files'

export type TFileDirectoryItem = TFileDirectory & {
  expanded?: boolean
  level?: number
  levels?: number[]
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
    FileIconComponent
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
    loader: ({ request }) => this.getFiles({ ...request })
  })

  readonly attachments = linkedModel({
    initialValue: null,
    compute: () => this.#attachments.value(),
    update: () => {}
  })
  readonly isLoading = computed(() => this.#attachments.status() === 'loading')

  readonly flatAttachments = computed(() => {
    const flatten = (items: TFileDirectoryItem[], level = 0): TFileDirectoryItem[] => {
      return items.reduce((acc: TFileDirectoryItem[], item) => {
        acc.push({ ...item, level, levels: new Array(level).fill(null) })
        if (item.expanded && item.children && item.children.length > 0) {
          acc.push(...flatten(item.children, level + 1))
        }
        return acc
      }, [])
    }
    return this.attachments() && flatten(this.attachments())
  })

  constructor() {
    effect(() => {
      // console.log(this.attachments(), this.flatAttachments())
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
      this.attachments.update((state) => {
        const attachments = cloneDeep(state)
        const found = findAttachmentByFullPath(attachments, item.fullPath)
        if (found) {
          found.expanded = item.expanded
        }
        return attachments
      })
      if (item.expanded && !item.children) {
        this.getFiles({
          projectId: this.projectId(),
          conversationId: this.conversationId(),
          path: item.fullPath
        }).subscribe({
          next: (files) => {
            console.log(files)
            this.attachments.update((state) => {
              const attachments = cloneDeep(state)
              const found = findAttachmentByFullPath(attachments, item.fullPath)
              if (found) {
                found.children = files
              }
              return attachments
            })
          }
        })
      }
    }
  }

  getFiles(params: { projectId?: string; conversationId?: string; path?: string }) {
    const { projectId, conversationId, path } = params
    return projectId
      ? this.#projectService.getFiles(projectId, path)
      : conversationId
        ? this.#conversation.getFiles(conversationId, path)
        : of(null)
  }

  close() {
    this.#dialogRef.close()
  }
}

// Find the attachment in the tree by fullPath
function findAttachmentByFullPath(
  items: TFileDirectoryItem[],
  fullPath: string
): TFileDirectoryItem | undefined {
  for (const item of items) {
    if (item.fullPath === fullPath) {
      return item
    }
    if (item.children) {
      const found = findAttachmentByFullPath(item.children, fullPath)
      if (found) {
        return found
      }
    }
  }
  return undefined
}