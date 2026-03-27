import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { rxResource } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert, IXpertWorkspace, OrderTypeEnum, XpertAPIService, XpertTypeEnum } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { map, of } from 'rxjs'
import { XpertNewBlankComponent } from '../../../xpert'
import { XpertStudioComponent } from '../../studio.component'

@Component({
  selector: 'xpert-studio-header-switcher',
  standalone: true,
  imports: [CommonModule, CdkMenuModule, TranslateModule, EmojiAvatarComponent],
  templateUrl: './switcher.component.html',
  animations: [...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStudioHeaderSwitcherComponent {
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #xpertAPI = inject(XpertAPIService)
  readonly #studioComponent = inject(XpertStudioComponent)
  readonly #xpertsRequested = signal(false)

  readonly xpert = this.#studioComponent.xpert
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly currentXpertName = computed(() => this.xpert()?.title || this.xpert()?.name)
  readonly #workspaceXperts = rxResource<IXpert[], string | undefined>({
    params: () => (this.#xpertsRequested() ? this.workspaceId() : undefined),
    defaultValue: [] as IXpert[],
    stream: ({ params }) =>
      params
        ? this.#xpertAPI
            .getAllByWorkspace(params, {
              where: {
                type: XpertTypeEnum.Agent,
                latest: true
              },
              relations: ['knowledgebase'],
              order: { updatedAt: OrderTypeEnum.DESC }
            })
            .pipe(map(({ items }) => items.filter((item) => item.latest)))
        : of([] as IXpert[])
  })
  readonly workspaceXperts = computed(() => this.#workspaceXperts.value())
  readonly xpertsLoading = this.#workspaceXperts.isLoading

  readonly switchableXperts = computed(() => {
    const currentXpert = this.xpert() as IXpert | null
    const items = this.workspaceXperts()
    const merged =
      currentXpert?.id && !items.some((item) => item.id === currentXpert.id) ? [currentXpert, ...items] : items

    return currentXpert?.id
      ? [
          ...merged.filter((item) => item.id === currentXpert.id),
          ...merged.filter((item) => item.id !== currentXpert.id)
        ]
      : merged
  })

  loadXperts() {
    this.#xpertsRequested.set(true)
  }

  backToWorkspace() {
    const workspaceId = this.workspaceId()
    this.#router.navigate(workspaceId ? ['/xpert/w', workspaceId] : ['/xpert/w'])
  }

  switchXpert(xpert: IXpert) {
    if (!xpert?.id || xpert.id === this.xpert()?.id) {
      return
    }

    this.openXpert(xpert)
  }

  createXpert() {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return
    }

    this.#dialog
      .open<IXpert>(XpertNewBlankComponent, {
        disableClose: true,
        data: {
          workspace: this.xpert()?.workspace ?? ({ id: workspaceId } as IXpertWorkspace),
          type: XpertTypeEnum.Agent
        }
      })
      .closed.subscribe((xpert) => {
        if (xpert?.id) {
          this.openXpert(xpert)
        }
      })
  }

  private openXpert(xpert: IXpert) {
    if (xpert.type === XpertTypeEnum.Knowledge && xpert.knowledgebase?.id) {
      this.#router.navigate(['/xpert/knowledges', xpert.knowledgebase.id, 'xpert', xpert.id])
      return
    }

    if (xpert.type === XpertTypeEnum.Copilot) {
      this.#router.navigate(['/xpert/x', xpert.id, 'copilot'])
      return
    }

    this.#router.navigate(['/xpert/x', xpert.id, 'agents'])
  }
}
