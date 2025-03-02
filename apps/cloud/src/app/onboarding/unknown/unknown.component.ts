import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { injectHelpWebsite } from '../../@core'

@Component({
  standalone: true,
  selector: 'onboarding-unknown',
  templateUrl: './unknown.component.html',
  styleUrls: ['./unknown.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, NgmCommonModule]
})
export class OnboardingUnknownComponent {
  readonly helpWebsite = injectHelpWebsite()

}
