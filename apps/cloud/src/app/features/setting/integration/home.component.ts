import { CdkMenuModule } from '@angular/cdk/menu'
import { DatePipe } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { DynamicGridDirective } from '@metad/core'
import { NgmConfirmDeleteComponent, NgmSearchComponent, NgmTagsComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, combineLatestWith, debounceTime, EMPTY, map, startWith, switchMap } from 'rxjs'
import { getErrorMessage, IIntegration, IntegrationService, routeAnimations, ToastrService } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { CardCreateComponent } from '../../../@shared/card'
import { UserPipe } from '../../../@shared/pipes'

@Component({
  standalone: true,
  selector: 'pac-settings-integrations',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    UserPipe,
    NgmTagsComponent,
    CardCreateComponent,
    EmojiAvatarComponent,
    DynamicGridDirective,
    NgmSearchComponent
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
  readonly searchControl = new FormControl('')

  readonly integrations = toSignal(
    this.refresh$.pipe(
      switchMap(() => this.integrationService.getAllInOrg({ relations: ['createdBy'] })),
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          map((text) => text?.toLowerCase()),
          startWith('')
        )
      ),
      map(([{ items }, search]) =>
        search
          ? items.filter(
              (item) => item.name.toLowerCase().includes(search) || item.description?.toLowerCase().includes(search)
            )
          : items
      )
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
