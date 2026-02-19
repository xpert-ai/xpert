import { CommonModule } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { importProvidersFrom } from '@angular/core'
import { provideAnimations } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { Meta, applicationConfig, moduleMetadata } from '@storybook/angular'
import { MarkdownModule } from 'ngx-markdown'
import { provideLogger, provideTranslate, zhHansLanguage } from '../../mock/'
import { NgmCopilotChatComponent } from '../chat/chat.component'
import { provideClientCopilot } from '../services'

export default {
  title: 'Copilot/NotEnabled',
  component: NgmCopilotChatComponent,
  decorators: [
    applicationConfig({
      providers: [
        provideAnimations(),
        provideHttpClient(),
        provideTranslate(zhHansLanguage),
        importProvidersFrom(OcapCoreModule),
        importProvidersFrom(MarkdownModule.forRoot()),
        provideClientCopilot(() => Promise.resolve({
          enabled: true,
          chatUrl: '',
          defaultModel: ''
        })),
        provideLogger()
      ]
    }),
    moduleMetadata({
      imports: [CommonModule, NgmCopilotChatComponent],
      providers: []
    })
  ]
} as Meta<NgmCopilotChatComponent>

export const Primary = {
  args: {
    title: 'Primary',
    welcomeTitle: 'Welcome to My AI Copilot',
    welcomeSubTitle: 'Your AI Copilot'
  }
}
