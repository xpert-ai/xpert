import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective, NgmSearchComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, map, startWith } from 'rxjs'
import { IToolProvider, IXpertToolset, uuid, XpertToolsetCategoryEnum } from 'apps/cloud/src/app/@core'
import { ToolProviderCardComponent, ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'
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
  readonly elementRef = inject(ElementRef)
  readonly cdkMenu = inject(CdkMenu)
  private root = inject(XpertStudioComponent)
  readonly apiService = inject(XpertStudioApiService)
  readonly i18n = new NgmI18nPipe()

  readonly TYPES = [
    {
      value: null,
      label: 'All'
    },
    {
      value: XpertToolsetCategoryEnum.BUILTIN,
      label: 'Builtin'
    },
    {
      value: XpertToolsetCategoryEnum.API,
      label: 'Custom'
    }
  ]

  readonly #builtinToolProviders = this.apiService.builtinToolProviders
  readonly #toolsets = toSignal(this.apiService.toolsets$)
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
    this.apiService.createToolset(this.root.contextMenuPosition, toolset)
  }

  public createBuiltinToolset(toolset: IToolProvider): void {
    if (toolset.not_implemented) {
      return
    }
    this.cdkMenu.menuStack.closeAll()
    this.apiService.createToolset(this.root.contextMenuPosition, {
      id: uuid(),
      category: XpertToolsetCategoryEnum.BUILTIN,
      type: toolset.name,
      name: toolset.name
    })
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
}
