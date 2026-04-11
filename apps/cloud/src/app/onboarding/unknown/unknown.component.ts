
import { Component } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from '../../@core'

@Component({
  standalone: true,
  selector: 'onboarding-unknown',
  templateUrl: './unknown.component.html',
  styleUrls: ['./unknown.component.scss'],
  imports: [ReactiveFormsModule, TranslateModule, NgmCommonModule]
})
export class OnboardingUnknownComponent {
  readonly helpWebsite = injectHelpWebsite()

}
