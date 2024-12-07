import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { getErrorMessage, OverlayAnimations } from '@metad/core'
import { CdkConfirmDeleteComponent, NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmTooltipDirective, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { distinctUntilChanged, filter, switchMap } from 'rxjs/operators'
import { injectToastr, IXpert, routeAnimations, TXpertTeamDraft, XpertService, XpertTypeEnum } from '../../../@core'
import { MaterialModule } from '../../../@shared/material.module'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { InDevelopmentComponent } from '../../../@theme'
import { AppService } from '../../../app.service'
import { injectGetXpertTeam } from '../utils'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    RouterModule,
    CdkMenuModule,

    NgmCommonModule,
    EmojiAvatarComponent,
    NgmTooltipDirective,
    InDevelopmentComponent
  ],
  selector: 'xpert-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertComponent {
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly paramId = injectParams('id')
  readonly getXpertTeam = injectGetXpertTeam()
  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)

  readonly paramId$ = toObservable(this.paramId)
  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly xpertId = this.paramId
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())

  readonly draft = signal<TXpertTeamDraft>(null)
  readonly xpert = signal<Partial<IXpert>>(null)
  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly xpertType = computed(() => this.xpert()?.type)

  private xpertSub = this.paramId$
    .pipe(
      distinctUntilChanged(),
      filter(nonBlank),
      switchMap((id) => this.#refresh$.pipe(switchMap(() => this.getXpertTeam(id))))
    )
    .subscribe((value) => {
      this.xpert.set(value.draft?.team ?? value)
    })

  refresh() {
    this.#refresh$.next()
  }

  delete() {
    const xpert = this.xpert()
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: xpert.title,
          information: this.#translate.instant('PAC.Xpert.DeleteAllDataXpert', {
            value: xpert.name,
            Default: `Delete all data of xpert '${xpert.name}'?`
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.#xpertService.delete(xpert.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, xpert.title)
          this.#router.navigate(['/xpert/w', xpert.workspaceId])
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

}
