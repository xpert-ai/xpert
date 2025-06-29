import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { NgmHighlightDirective, NgmSearchComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IToolProvider, IXpertToolset, XpertToolsetCategoryEnum } from 'apps/cloud/src/app/@core'
import { ToolProviderCardComponent, ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { debounceTime, map, startWith } from 'rxjs'
import { EmojiAvatarComponent } from '../../../../../@shared/avatar'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'

@Component({
  selector: 'xpert-studio-toolset-menu',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    CdkListboxModule,
    OverlayModule,
    MatTooltipModule,

    NgmSearchComponent,
    NgmHighlightDirective,
    NgmI18nPipe,
    EmojiAvatarComponent,
    ToolsetCardComponent,
    ToolProviderCardComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioToolsetMenuComponent {
  eXpertToolsetCategoryEnum = XpertToolsetCategoryEnum

  readonly elementRef = inject(ElementRef)
  readonly cdkMenu = inject(CdkMenu)
  readonly #dialog = inject(Dialog)
  private root = inject(XpertStudioComponent)
  readonly apiService = inject(XpertStudioApiService)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly onSelect = input<(event: { toolset: IXpertToolset; provider: IToolProvider }) => void>()

  readonly TYPES = [
    {
      value: null,
      label: 'Provider'
    },
    {
      value: XpertToolsetCategoryEnum.BUILTIN,
      label: 'Builtin'
    },
    {
      value: XpertToolsetCategoryEnum.MCP,
      label: 'MCP'
    },
    {
      value: XpertToolsetCategoryEnum.API,
      label: 'API'
    }
  ]

  readonly #builtinToolProviders = this.apiService.builtinToolProviders
  readonly #toolsets = toSignal(this.apiService.toolsets$)
  readonly workspaceId = this.apiService.workspaceId
  readonly searchControl = new FormControl()
  readonly searchText = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      map((value) => value.trim().toLowerCase()),
      startWith('')
    )
  )

  readonly toolsets = computed(() => {
    const search = this.searchText()
    return this.#toolsets()
      ?.filter((_) => (this.type()[0] ? this.type().includes(_.category) : true))
      .filter((_) => (search ? _.name.toLowerCase().includes(search) : true))
  })

  readonly toolProviders = computed(() => {
    const search = this.searchText()
    return this.#builtinToolProviders()?.filter(
      (provider) =>
        provider.name.toLowerCase().includes(search) ||
        this.i18n.transform(provider.description)?.toLowerCase().includes(search)
    )
  })

  readonly type = model<(XpertToolsetCategoryEnum | 'command')[]>([null])

  readonly toolDetailTrigger = signal<CdkOverlayOrigin>(null)
  readonly toolDetailOpen = signal(false)
  readonly toolset = signal<IXpertToolset>(null)
  readonly builtinToolset = signal<IToolProvider>(null)

  public createToolset(toolset: IXpertToolset): void {
    this.cdkMenu.menuStack.closeAll()
    // this.apiService.createToolset(this.root.contextMenuPosition, toolset)
    this.onSelect()?.({ toolset, provider: null })
  }

  public createBuiltinToolset(provider: IToolProvider): void {
    if (provider.not_implemented) {
      return
    }
    this.cdkMenu.menuStack.closeAll()
    this.onSelect()?.({ toolset: null, provider })
    // this.apiService.createToolset(this.root.contextMenuPosition, {
    //   key: uuid(),
    //   category: XpertToolsetCategoryEnum.BUILTIN,
    //   type: toolset.name,
    //   name: toolset.name
    // })
  }

  openToolsetTip(toolset: IXpertToolset, overlayTrigger: CdkOverlayOrigin) {
    this.toolDetailOpen.set(true)
    this.toolDetailTrigger.set(overlayTrigger)
    this.toolset.set(toolset)
    this.builtinToolset.set(null)
  }

  openBuiltinToolsetTip(toolset: IToolProvider, overlayTrigger: CdkOverlayOrigin) {
    this.toolDetailOpen.set(true)
    this.toolDetailTrigger.set(overlayTrigger)
    this.builtinToolset.set(toolset)
    this.toolset.set(null)
  }

  createMCPToolset() {
    let toolset: Partial<IXpertToolset> = null
    this.#dialog
      .open<{ toolset: IXpertToolset }>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolset
        }
      })
      .closed.subscribe({
        next: ({ toolset }) => {
          if (toolset) {
            this.onSelect()?.({ toolset, provider: null })
          }
        }
      })
  }
}
