import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenu, CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmSearchComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertTool, IXpertToolset, XpertToolsetCategoryEnum } from 'apps/cloud/src/app/@core'
import { debounceTime, map, startWith } from 'rxjs'
import { EmojiAvatarComponent } from '../../../../../@shared/avatar/emoji-avatar/avatar.component'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay'
import { ToolsetCardComponent } from 'apps/cloud/src/app/@shared/xpert'

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
    
    EmojiAvatarComponent,
    ToolsetCardComponent
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

  readonly type = model<(XpertToolsetCategoryEnum | 'command')[]>([null])

  readonly toolDetailTrigger = signal<CdkOverlayOrigin>(null)
  readonly toolDetailOpen = signal(false)
  readonly toolset = signal<IXpertToolset>(null)

  public createToolset(toolset: IXpertToolset): void {
    this.cdkMenu.menuStack.closeAll()
    this.apiService.createToolset(this.root.contextMenuPosition, toolset)
  }

  openToolsetTip(toolset: IXpertToolset, overlayTrigger: CdkOverlayOrigin) {
    this.toolDetailOpen.set(true)
    this.toolDetailTrigger.set(overlayTrigger)
    this.toolset.set(toolset)
  }
}
