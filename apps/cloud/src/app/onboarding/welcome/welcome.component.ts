import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from '../../@core'

@Component({
  standalone: true,
  selector: 'ngm-onboarding-welcome',
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
  imports: [TranslateModule, CdkMenuModule]
})
export class WelcomeComponent {
  private router = inject(Router)
  readonly helpWebsite = injectHelpWebsite()

  navigateTenant() {
    this.router.navigate(['onboarding', 'tenant'])
  }

}
