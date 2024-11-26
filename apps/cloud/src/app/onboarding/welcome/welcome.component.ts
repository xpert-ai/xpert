import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { injectLanguage, LanguagesEnum } from '../../@core'

@Component({
  standalone: true,
  selector: 'ngm-onboarding-welcome',
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
  imports: [TranslateModule, CdkMenuModule]
})
export class WelcomeComponent {
  private translate = inject(TranslateService)
  private router = inject(Router)
  private route = inject(Router)
  readonly currentLanguage = injectLanguage()

  Languages = Object.values(LanguagesEnum).filter((lang) => lang !== LanguagesEnum.Chinese)

  navigateTenant() {
    this.router.navigate(['onboarding', 'tenant'])
  }

  selectLang(selectLang: LanguagesEnum) {
    this.translate.use(selectLang)
  }
}
