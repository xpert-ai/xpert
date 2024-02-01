import { Component, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

@Component({
  selector: 'pac-onboarding',
  template: ` <router-outlet></router-outlet> `,
  styles: [`:host {
	display: flex;
	width: 100%;
	height: 100%;
  background-color: var(--ngm-app-background-color);
  color: var(--ngm-color-on-surface);
}`],
})
export class OnboardingComponent {
  private translate = inject(TranslateService)
}
