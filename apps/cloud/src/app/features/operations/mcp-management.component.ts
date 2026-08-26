import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { ZardIconComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { XpertMcpPublicationsComponent } from './mcp-publications/publications.component'
import { McpRuntimesComponent } from './mcp-runtimes.component'

type McpManagementSection = 'services' | 'runtimes'

@Component({
  standalone: true,
  selector: 'xp-mcp-management',
  templateUrl: './mcp-management.component.html',
  imports: [
    TranslateModule,
    XpertMcpPublicationsComponent,
    McpRuntimesComponent,
    ZardIconComponent,
    ...ZardTabsImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full w-full min-w-0 flex-1'
  }
})
export class McpManagementComponent {
  readonly activeSection = signal<McpManagementSection>('services')

  setSection(section: McpManagementSection) {
    this.activeSection.set(section)
  }
}
