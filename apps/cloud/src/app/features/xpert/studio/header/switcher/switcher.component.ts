import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert, IXpertWorkspace, OrderTypeEnum, XpertAPIService, XpertTypeEnum } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { distinctUntilChanged, map, of, switchMap } from 'rxjs'
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

  readonly xpert = this.#studioComponent.xpert
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly currentXpertName = computed(() => this.xpert()?.title || this.xpert()?.name)
  readonly workspaceXperts = toSignal(
    toObservable(this.workspaceId).pipe(
      distinctUntilChanged(),
      switchMap((workspaceId) =>
        workspaceId
          ? this.#xpertAPI
              .getAllByWorkspace(workspaceId, {
                where: {
                  type: XpertTypeEnum.Agent,
                  latest: true
                },
                order: { updatedAt: OrderTypeEnum.DESC }
              })
              .pipe(map(({ items }) => items.filter((item) => item.latest)))
          : of([] as IXpert[])
      )
    ),
    { initialValue: [] as IXpert[] }
  )
  readonly switchableXperts = computed(() => {
    const currentXpert = this.xpert() as IXpert | null
    const items = this.workspaceXperts() ?? []
    const merged =
      currentXpert?.id && !items.some((item) => item.id === currentXpert.id) ? [currentXpert, ...items] : items

    return currentXpert?.id
      ? [
          ...merged.filter((item) => item.id === currentXpert.id),
          ...merged.filter((item) => item.id !== currentXpert.id)
        ]
      : merged
  })

  backToWorkspace() {
    const workspaceId = this.workspaceId()
    this.#router.navigate(workspaceId ? ['/xpert/w', workspaceId] : ['/xpert/w'])
  }

  switchXpert(xpert: IXpert) {
    if (!xpert?.id || xpert.id === this.xpert()?.id) {
      return
    }

    this.#router.navigate(['/xpert/x', xpert.id, 'agents'])
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
          this.switchXpert(xpert)
        }
      })
  }
}
