import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { FeatureService, getErrorMessage, injectToastr, IOrganization, routeAnimations } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { SharedModule } from '../../../@shared/shared.module'
import { NgmSpinComponent } from '@metad/ocap-angular/common'


@Component({
  standalone: true,
  imports: [SharedModule, NgmSpinComponent],
  providers: [FeatureService],
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations]
})
export class PACFeaturesComponent extends TranslationBaseComponent implements OnInit {
  private router = inject(Router)
  readonly #featureService = inject(FeatureService)
  readonly #toastr = injectToastr()

  tabs: any[]
  organization: IOrganization

  readonly loading = signal(false)

  private langSub = this.translateService.onLangChange.pipe(takeUntilDestroyed()).subscribe(() => {
    this.loadTabs()
  })

  ngOnInit(): void {
    this.loadTabs()
  }

  loadTabs() {
    this.tabs = [
      {
        title: this.getTranslation('MENU.TENANT'),
        route: this.getRoute('tenant')
      },
      {
        title: this.getTranslation('MENU.ORGANIZATION'),
        route: this.getRoute('organization')
      }
    ]
  }

  getRoute(tab: string): string {
    return `/settings/features/${tab}`
  }

  navigate(url) {
    this.router.navigate([url])
  }

  upgrade() {
    this.loading.set(true)
    this.#featureService.upgrade().subscribe({
      next: () => {
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', {Default: 'Updated successfully'})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
