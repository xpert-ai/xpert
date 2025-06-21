import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { cloneDeep, sortBy } from 'lodash-es'
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

/**
 * Corresponding to the file directory structure of the **Sandbox volume**
 */
@Component({
  standalone: true,
  selector: 'chat-file-list',
  templateUrl: `file-list.component.html`,
  styleUrl: `file-list.component.scss`,
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
export class ChatFileListComponent {
  readonly #conversation = inject(ChatConversationService)
  readonly #projectService = inject(XpertProjectService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly projectId = input<string | undefined>()
  readonly conversationId = input<string>()
  readonly refresh = model<object>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly #attachments = myRxResource<{ projectId?: string; conversationId: string }, TFileDirectoryItem[]>({
    request: () => this.refresh() && {
    projectId: this.projectId(),
    conversationId: this.conversationId()
  },
    loader: ({ request }) => this.getFiles({ ...request })
  })

  readonly attachments = linkedModel({
    initialValue: null,
    compute: () => this.#attachments.value(),
    update: () => {}
  })

  readonly flatAttachments = computed(() => {
    return this.attachments() && flatten(this.attachments())
  })

  readonly loading = linkedModel({
    initialValue: false,
    compute: () => this.#attachments.status() === 'loading',
    update: () => {}
  })

  constructor() {
    effect(() => {
      // console.log(this.attachments(), this.flatAttachments())
    })
  }

  preview(file: TFile) {
    // this.#dialogRef.close(file)
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

  deleteFile(file: TFileDirectoryItem) {
    this.loading.set(true);
    (this.projectId() ? 
      this.#projectService.deleteFile(this.projectId(), file.fullPath)
      : this.#conversation.deleteFile(this.conversationId(), file.fullPath)).subscribe({
        next: () => {
          this.loading.set(false)
          this.refresh.set({}) // Trigger refresh
          this.#toastr.success('PAC.Chat.FileDeleted', {Default: 'File deleted successfully'})
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error('PAC.Chat.FileDeleteError', '', {Default: 'Failed to delete file'})
        },
      })
  }
}

function flatten(items: TFileDirectoryItem[], level = 0): TFileDirectoryItem[] {
  return sortBy(items, 'createdAt').reverse().reduce((acc: TFileDirectoryItem[], item) => {
    acc.push({ ...item, level, levels: new Array(level).fill(null) })
    if (item.expanded && item.children && item.children.length > 0) {
      acc.push(...flatten(item.children, level + 1))
    }
    return acc
  }, [])
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