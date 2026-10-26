import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { McpManagementComponent } from './mcp-management.component'

describe('MCP panel destinations', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'operations', component: McpManagementComponent }])]
    }).overrideComponent(McpManagementComponent, { set: { imports: [], template: '{{ activeSection() }}' } })
  })

  it('restores runtime instances from a direct URL and follows subsequent navigation', async () => {
    const harness = await RouterTestingHarness.create()
    const page = await harness.navigateByUrl('/operations?section=runtimes', McpManagementComponent)
    expect(page.activeSection()).toBe('runtimes')
    await harness.navigateByUrl('/operations?section=services')
    expect(page.activeSection()).toBe('services')
    await harness.navigateByUrl('/operations?section=runtimes')
    expect(page.activeSection()).toBe('runtimes')
  })

  it('defaults missing and unrecognized sections to services', async () => {
    const harness = await RouterTestingHarness.create()
    const page = await harness.navigateByUrl('/operations?section=unknown', McpManagementComponent)
    expect(page.activeSection()).toBe('services')
    await harness.navigateByUrl('/operations')
    expect(page.activeSection()).toBe('services')
  })
})
