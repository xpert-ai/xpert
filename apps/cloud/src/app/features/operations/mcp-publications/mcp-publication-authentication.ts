import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports,
  ZardSwitchComponent,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import type { XpertMcpPublicationsComponent } from './publications.component'
@Component({
  selector: 'xp-mcp-publication-authentication',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardFormImports,
    ...ZardSelectImports,
    ...ZardTableImports
  ],
  templateUrl: './mcp-publication-authentication.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class McpPublicationAuthenticationComponent {
  readonly vm = input.required<XpertMcpPublicationsComponent>()
}
