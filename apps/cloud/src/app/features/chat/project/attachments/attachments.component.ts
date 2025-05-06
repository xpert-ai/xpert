import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpEventType } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import {
  getErrorMessage,
  injectProjectService,
  injectToastr,
  IStorageFile,
  IXpertProjectFile,
  StorageFileService
} from '@cloud/app/@core'
import { FileIconComponent, StorageFileComponent } from '@cloud/app/@shared/files'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { FileTypePipe, linkedModel, NgmDndDirective } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { combineLatest, EMPTY, of } from 'rxjs'
import { catchError, map, switchMap, tap } from 'rxjs/operators'
import { ChatProjectHomeComponent } from '../home/home.component'
import { ChatProjectComponent } from '../project.component'
import { MatProgressBarModule } from '@angular/material/progress-bar'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    MatProgressBarModule,
    NgmSpinComponent,
    FileIconComponent,
    FileTypePipe,
    NgmDndDirective,
    StorageFileComponent
  ],
  selector: 'chat-project-attachments',
  templateUrl: './attachments.component.html',
  styleUrl: 'attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectAttachmentsComponent {
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectSercice = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #projectHomeComponent = inject(ChatProjectHomeComponent)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18n = injectI18nService()
  readonly storageFileService = inject(StorageFileService)

  readonly project = this.#projectComponent.project

  readonly files = toSignal(this.#projectHomeComponent.files$.pipe(map(({ files }) => files)))
  readonly #loading = toSignal(this.#projectHomeComponent.files$.pipe(map(({ loading }) => loading)))

  readonly loading = linkedModel({
    initialValue: null,
    compute: () => this.#loading(),
    update: () => {}
  })

  readonly fileList = linkedModel({
    initialValue: [],
    compute: () => (this.files() ? buildFileTree(this.files()) : []),
    update: () => {}
  })

  readonly dataSource = computed(() => flattenTree(this.fileList()))

  // Uploading
  readonly uploadFileList = signal<{ file: File; progress?: number; error?: string; storageFile?: IStorageFile }[]>([])

  constructor() {
    effect(() => {
      // console.log(this.uploadFileList())
    })
  }

  toggleExpand(item: FlatTreeNode) {
    item.node.expand = !item.node.expand
    this.fileList.update((nodes) => [...nodes])
  }

  deleteFile(file: IXpertProjectFile) {
    this.confirmDelete({
      value: file.filePath,
      information: this.i18n.translate('PAC.XProject.DeleteFileFromProject', { Default: 'Delete file from project?' })
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return file.id ? this.projectSercice.deleteFile(this.project().id, file.id)
              : this.projectSercice.deleteAttachment(this.project().id, file.storageFileId)
          }
          return EMPTY
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#projectHomeComponent.refreshFiles$.next()
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  moveToProject(item, storageFile: IStorageFile) {
    this.uploadFileList.update((state) => state.filter((_) => _ !== item))
    this.loading.set(true)
    this.projectSercice.addAttachments(this.project().id, [storageFile.id]).subscribe({
      next: () => {
        this.loading.set(false)
        this.#projectHomeComponent.refreshFiles$.next()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  /**
   * on file drop handler
   */
  onFileDropped(event: FileList) {
    const filesArray = Array.from(event);
    this.uploadFileList.update((state) => [...state, ...filesArray.map((file) => ({ file }))]);
  }

  /**
   * handle file from browsing
   */
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }

  stopUpload(item) {
    this.uploadFileList.update((state) => state.filter((_) => _ !== item));
  }
}

type FileNode = {
  name: string
  type: 'file'
  children?: undefined
  file?: IXpertProjectFile
  expand?: boolean
}

type FolderNode = {
  name: string
  type: 'folder'
  children: TreeNode[]
  file?: IXpertProjectFile
  expand?: boolean
}

type TreeNode = FileNode | FolderNode

type FolderBuilderNode = {
  name: string
  type: 'folder'
  children: Record<string, TreeNode | FolderBuilderNode>
}

function buildFileTree(paths: IXpertProjectFile[]): TreeNode[] {
  const root: Record<string, TreeNode | FolderBuilderNode> = {}

  for (const file of paths) {
    const parts = file.filePath.split('/')
    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1

      if (isFile) {
        currentLevel[part] = { name: part, type: 'file', file }
      } else {
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            type: 'folder',
            children: {}
          }
        }
        const folder = currentLevel[part] as FolderBuilderNode
        currentLevel = folder.children
      }
    }
  }

  // Convert to TreeNode[]
  function objectToArray(nodeMap: Record<string, TreeNode | FolderBuilderNode>): TreeNode[] {
    return Object.values(nodeMap).map((node) => {
      if (node.type === 'folder') {
        return {
          name: node.name,
          type: 'folder',
          children: objectToArray((node as FolderBuilderNode).children),
          expand: node.name === 'attachments'
        }
      }
      return node as FileNode
    })
  }

  return objectToArray(root)
}

// function flattenNodes(nodes: TreeNode[]): TreeNode[] {
//   const flattenedNodes = []
//   for (const node of nodes) {
//     flattenedNodes.push(node)
//     if (node.children) {
//       flattenedNodes.push(...flattenNodes(node.children))
//     }
//   }
//   return flattenedNodes
// }

export interface FlatTreeNode {
  name: string
  type: 'file' | 'folder'
  level: number
  file: IXpertProjectFile
  expandable: boolean
  node: TreeNode
}

function flattenTree(nodes: TreeNode[], level = 0): FlatTreeNode[] {
  const flatList: FlatTreeNode[] = []

  for (const node of nodes) {
    flatList.push({
      name: node.name,
      type: node.type,
      level,
      expandable: node.type === 'folder' && node.children.length > 0,
      file: node.file,
      node: node
    })

    if (node.expand && node.type === 'folder') {
      flatList.push(...flattenTree(node.children, level + 1))
    }
  }

  return flatList
}
