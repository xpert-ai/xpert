import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { IOrganization, routeAnimations } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'


@Component({
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations]
})
export class PACFeaturesComponent extends TranslationBaseComponent implements OnInit {
  private router = inject(Router)

  tabs: any[]
  organization: IOrganization

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
}
