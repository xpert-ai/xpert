import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  injectToastr,
  IXpertToolset,
  OrderTypeEnum,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { TXpertMCPManageComponentRet, XpertMCPManageComponent } from 'apps/cloud/src/app/@shared/mcp'

type CustomConnectorsDialogData = {
  workspaceId: string
  canManage: boolean
}

@Component({
  selector: 'xpert-custom-connectors-dialog',
  standalone: true,
  imports: [FormsModule, TranslateModule, EmojiAvatarComponent],
  templateUrl: './custom-connectors-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomConnectorsDialogComponent {
  readonly #dialog = inject(Dialog)
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<CustomConnectorsDialogData>(DIALOG_DATA)
  readonly #router = inject(Router)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #toastr = injectToastr()

  readonly workspaceId = this.#data.workspaceId
  readonly canManage = this.#data.canManage
  readonly loading = signal(true)
  readonly errorMessage = signal<string | null>(null)
  readonly searchQuery = signal('')
  readonly toolsets = signal<IXpertToolset[]>([])
  readonly filteredToolsets = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase()
    if (!query) {
      return this.toolsets()
    }

    return this.toolsets().filter((toolset) =>
      [toolset.name, toolset.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
    )
  })

  constructor() {
    void this.load()
  }

  async load() {
    this.loading.set(true)
    this.errorMessage.set(null)
    try {
      const { items } = await firstValueFrom(
        this.#toolsetService.getAllByWorkspace(this.workspaceId, {
          where: { category: XpertToolsetCategoryEnum.MCP },
          relations: ['createdBy', 'tags'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )
      this.toolsets.set(items)
    } catch (error) {
      const message = getErrorMessage(error)
      this.errorMessage.set(message)
      this.#toastr.error(message)
    } finally {
      this.loading.set(false)
    }
  }

  createMCPServer() {
    if (!this.canManage) {
      return
    }

    this.openMCPManager({ category: XpertToolsetCategoryEnum.MCP })
  }

  editMCPServer(toolset: IXpertToolset) {
    if (!this.canManage) {
      return
    }

    this.openMCPManager(undefined, toolset.id)
  }

  openMCPHub() {
    this.#dialogRef.close()
    void this.#router.navigate(['/xpert/w', this.workspaceId, 'mcp'])
  }

  close() {
    this.#dialogRef.close()
  }

  private openMCPManager(toolset?: Partial<IXpertToolset>, toolsetId?: string) {
    this.#dialog
      .open<TXpertMCPManageComponentRet>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId,
          ...(toolsetId ? { toolsetId } : { toolset })
        }
      })
      .closed.subscribe((result) => {
        if (result?.saved || result?.deleted) {
          void this.load()
        }
      })
  }
}
