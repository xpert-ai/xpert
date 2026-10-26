import { injectQueryParams } from 'ngxtension/inject-query-params'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertMcpPublicationsComponent } from './mcp-publications/publications.component'
import { McpRuntimesComponent } from './mcp-runtimes.component'

type McpManagementSection = 'services' | 'runtimes'

@Component({
  standalone: true,
  selector: 'xp-mcp-management',
  templateUrl: './mcp-management.component.html',
  imports: [TranslateModule, XpertMcpPublicationsComponent, McpRuntimesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full w-full min-w-0 flex-1'
  }
})
export class McpManagementComponent {
  private readonly section = injectQueryParams('section')
  readonly activeSection = computed<McpManagementSection>(() =>
    this.section() === 'runtimes' ? 'runtimes' : 'services'
  )
}
