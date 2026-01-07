import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { PacAuthModule } from '@metad/cloud/auth'
import { AuthService } from '@metad/cloud/state'
import { AuthStrategy } from './auth-strategy.service'
import { NoAuthGuard } from './no-auth.guard'
import { SignInSuccessComponent } from './signin-success/sign-in-success.component'

const socialLinks = [
  // {
  // 	url: environment.GOOGLE_AUTH_LINK,
  // 	icon: 'google-outline'
  // },
  // {
  // 	url: environment.LINKEDIN_AUTH_LINK,
  // 	icon: 'linkedin-outline'
  // },
  // {
  // 	url: environment.GITHUB_AUTH_LINK,
  // 	target: '_blank',
  // 	icon: 'github-outline'
  // },
  // {
  // 	url: environment.TWITTER_AUTH_LINK,
  // 	target: '_blank',
  // 	icon: 'twitter-outline'
  // },
  // {
  // 	url: environment.FACEBOOK_AUTH_LINK,
  // 	target: '_blank',
  // 	icon: 'facebook-outline'
  // },
  // {
  // 	url: environment.MICROSOFT_AUTH_LINK,
  // 	target: '_blank',
  // 	icon: 'grid'
  // }
]

@NgModule({
  declarations: [SignInSuccessComponent],
  imports: [CommonModule],
  exports: [SignInSuccessComponent],
  providers: [
    ...PacAuthModule.forRoot({
      strategies: [AuthStrategy.setup({ name: 'email' })],
      forms: {
        login: { socialLinks },
        register: { socialLinks }
      }
    }).providers,
    NoAuthGuard,
    AuthStrategy,
    AuthService
  ]
})
export class AuthModule {}
