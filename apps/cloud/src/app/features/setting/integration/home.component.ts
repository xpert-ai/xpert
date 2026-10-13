import { CommonModule, DatePipe } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import {
  XpConfirmDeleteService,
  ZardBadgeComponent,
  ZardSearchInputComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardMenuImports
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, catchError, debounceTime, EMPTY, map, of, startWith, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IIntegration,
  IntegrationService,
  OrderTypeEnum,
  routeAnimations,
  Store,
  RequestScopeLevel,
  ToastrService
} from '../../../@core'
import { EmojiAvatarComponent, IconComponent } from '../../../@shared/avatar'
import { UserPipe } from '../../../@shared/pipes'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { injectHelpWebsite } from '../../../@core/providers/website'
import { IntegrationProviderSelectComponent } from './integration-provider-select.component'

@Component({
  standalone: true,
  selector: 'xp-settings-integrations',
  templateUrl: './home.component.html',
  host: { class: 'block w-full min-w-0' },
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    UserPipe,
    ZardBadgeComponent,
    EmojiAvatarComponent,
    ZardSearchInputComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
    IntegrationProviderSelectComponent,
    IconComponent,
    XpI18nPipe
  ],
  animations: [routeAnimations]
})
export class IntegrationHomeComponent {
  readonly integrationAPI = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #confirmDelete = inject(XpConfirmDeleteService)
  readonly #translate = inject(TranslateService)

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly searchControl = new FormControl('')
  readonly provider = model<string | null>(null)

  private readonly store = inject(Store)
  readonly activeScope = toSignal(this.store.selectActiveScope(), { initialValue: this.store.activeScope })
  readonly tenantScope = RequestScopeLevel.TENANT
  readonly helpWebsite = injectHelpWebsite()
  readonly loadFailed = signal(false)
  readonly providers = toSignal(this.integrationAPI.getProviders(), { initialValue: [] })
  readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      map((value) => value?.trim().toLowerCase() ?? '')
    ),
    { initialValue: '' }
  )
  readonly directory = toSignal(
    this.refresh$.pipe(
      switchMap(() => {
        this.loadFailed.set(false)
        return this.integrationAPI
          .getAllInOrg({ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } })
          .pipe(
            map(({ items }) => ({ items, loading: false })),
            startWith({ items: [] as IIntegration[], loading: true }),
            catchError((error) => {
              this.loadFailed.set(true)
              this.#toastr.error(getErrorMessage(error))
              return of({ items: [] as IIntegration[], loading: false })
            })
          )
      })
    ),
    { initialValue: { items: [] as IIntegration[], loading: true } }
  )
  readonly loading = computed(() => this.directory().loading)
  readonly filteredIntegrations = computed(() =>
    this.directory().items.filter(
      (item) =>
        (!this.provider() || item.provider === this.provider()) &&
        (!this.search() ||
          item.name.toLowerCase().includes(this.search()) ||
          item.description?.toLowerCase().includes(this.search()))
    )
  )

  providerInfo(name: string) {
    return this.providers().find((provider) => provider.name === name)
  }

  clearFilters() {
    this.searchControl.setValue('')
    this.provider.set(null)
  }

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
    this.#confirmDelete
      .confirm({
        value: item.name,
        information: this.#translate.instant('XP.Integration.ConfirmDeleteIntegration', {
          Default: `Confirm delete the integration?`
        })
      })
      .pipe(switchMap((confirm) => (confirm ? this.integrationAPI.delete(item.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.refresh()
          this.#toastr.success('XP.Messages.DeletedSuccessfully', 'Deleted Successfully')
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error), 'Error')
        }
      })
  }
}
