import { DragDropModule } from '@angular/cdk/drag-drop'

import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ZardButtonComponent, ZardDialogModule, ZardFormImports, ZardIconComponent, ZardInputDirective, ZardTabsImports } from '@xpert-ai/headless-ui'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AnalyticsFeatures, FeatureEnum, Store, routeAnimations } from '../../@core'
import { AppService } from '../../app.service'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterModule, DragDropModule, RouterModule, ...ZardTabsImports, ...ZardFormImports, ZardIconComponent, ZardButtonComponent, MatDialogModule, ZardInputDirective, MatSidenavModule, TranslateModule, DensityDirective, ButtonGroupDirective, NgmCommonModule, AppearanceDirective],
  selector: 'pac-home',
  template: `
    <nav
      z-tab-nav-bar
      [tabPanel]="tabPanel"
      stretchTabs="false"
      alignTabs="start"
      color="accent"
      disableRipple
      displayDensity="cosy"
      class="pac-home__navigation p-0 sm:px-2 md:px-8"
      >
      <span
        z-tab-link
        routerLink="."
        routerLinkActive
        #rla="routerLinkActive"
        [routerLinkActiveOptions]="{ exact: true }"
        [active]="rla.isActive"
        >
        {{ 'PAC.MENU.HOME.TODAY' | translate: { Default: 'Today' } }}
      </span>
      @if (hasFeatureEnabled(AnalyticsFeatures.FEATURE_HOME_CATALOG)) {
        <span
          z-tab-link
          routerLink="./catalog"
          routerLinkActive
          #rla2="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: true }"
          [active]="rla2.isActive"
          >
          {{ 'PAC.MENU.HOME.Catalog' | translate: { Default: 'Catalog' } }}
        </span>
      }
      @if (hasFeatureEnabled(AnalyticsFeatures.FEATURE_HOME_TREND)) {
        <span
          z-tab-link
          routerLink="./trending"
          routerLinkActive
          #rla3="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: true }"
          [active]="rla3.isActive"
          >
          {{ 'PAC.MENU.HOME.Trending' | translate: { Default: 'Trending' } }}
        </span>
      }
      <!-- Insight tab remains disabled until the feature is restored. -->
    </nav>
    <z-tab-nav-panel
      #tabPanel
      class="relative flex-1 overflow-auto"
      [@routeAnimations]="o.isActivated && o.activatedRoute.routeConfig.path"
      >
      <router-outlet #o="outlet"></router-outlet>
    </z-tab-nav-panel>
    `,
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent {
  private readonly appService = inject(AppService)
  private readonly store = inject(Store)
  public readonly copilotEnabled = toSignal(this.appService.copilotEnabled$)

  FeatureEnum = FeatureEnum
  AnalyticsFeatures = AnalyticsFeatures

  hasFeatureEnabled(featureKey: FeatureEnum | AnalyticsFeatures) {
    return this.store.hasFeatureEnabled(featureKey)
  }
}
