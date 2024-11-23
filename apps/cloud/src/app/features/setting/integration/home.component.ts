import { AsyncPipe, DatePipe } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmConfirmDeleteComponent, NgmTagsComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY, map, switchMap } from 'rxjs'
import { getErrorMessage, IIntegration, IntegrationService, routeAnimations, ToastrService } from '../../../@core'
import { CardCreateComponent, MaterialModule, UserPipe } from '../../../@shared'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { CdkMenuModule } from '@angular/cdk/menu'
import { DynamicGridDirective } from '@metad/core'

@Component({
  standalone: true,
  selector: 'pac-settings-integrations',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [
    AsyncPipe,
    DatePipe,
    RouterModule,
    TranslateModule,
    MaterialModule,
    CdkMenuModule,
    UserPipe,
    NgmTagsComponent,
    CardCreateComponent,
    EmojiAvatarComponent,
    DynamicGridDirective
  ],
  animations: [routeAnimations]
})
export class IntegrationHomeComponent {
  readonly integrationService = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(MatDialog)
  readonly #translate = inject(TranslateService)

  readonly refresh$ = new BehaviorSubject<void>(null)

  readonly integrations = toSignal(
    this.refresh$.pipe(
      switchMap(() => this.integrationService.getAllInOrg({ relations: ['createdBy'] })),
      map(({ items }) => items)
    )
  )

  newIntegration() {
    this.#router.navigate(['create'], { relativeTo: this.#route })
  }

  open(id: string) {
    this.#router.navigate([id], { relativeTo: this.#route })
  }

  refresh() {
    this.refresh$.next()
  }

  edit(item: IIntegration) {
    this.#router.navigate([item.id], { relativeTo: this.#route })
  }

  remove(item: IIntegration) {
    this.#dialog
      .open(NgmConfirmDeleteComponent, {
        data: {
          value: item.name,
          information: this.#translate.instant('PAC.Integration.ConfirmDeleteIntegration', {
            Default: `Confirm delete the integration?`
          })
        }
      })
      .afterClosed()
      .pipe(switchMap((confirm) => (confirm ? this.integrationService.delete(item.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.refresh()
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', 'Deleted Successfully')
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error), 'Error')
        }
      })
  }
}
