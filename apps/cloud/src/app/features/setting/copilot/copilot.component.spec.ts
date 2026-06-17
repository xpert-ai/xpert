import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { provideRouter, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService } from '../../../@core'
import { CopilotComponent } from './copilot.component'
import { Store } from '@xpert-ai/cloud/state'

const COPILOT_MONITORING_FEATURE = 'FEATURE_COPILOT_MONITORING'
let organization: unknown = { id: 'org-1' }
let monitoringEnabled = true

jest.mock('../../../@core', () => ({
  AiFeatureEnum: {
    FEATURE_COPILOT_MONITORING: 'FEATURE_COPILOT_MONITORING'
  },
  ToastrService: class ToastrService {},
  routeAnimations: jest.requireActual('@angular/animations').trigger('routeAnimations', [])
}))

jest.mock('@xpert-ai/cloud/state', () => ({
  AiFeatureEnum: {
    FEATURE_COPILOT_MONITORING: 'FEATURE_COPILOT_MONITORING'
  },
  injectOrganization: () => () => organization,
  Store: class Store {
    featureContextHydrated = true
    featureContextHydrated$ = jest.requireActual('rxjs').of(true)

    hasFeatureEnabled(feature: string) {
      return feature === 'FEATURE_COPILOT_MONITORING' && monitoringEnabled
    }
  }
}))

describe('CopilotComponent', () => {
  beforeEach(() => {
    organization = { id: 'org-1' }
    monitoringEnabled = true
  })

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [CopilotComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [provideRouter([]), ToastrService, { provide: Store, useClass: Store }],
      schemas: [NO_ERRORS_SCHEMA]
    })
      .overrideComponent(CopilotComponent, {
        set: {
          imports: [RouterModule, TranslateModule],
          schemas: [NO_ERRORS_SCHEMA]
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(CopilotComponent)
    fixture.detectChanges()
    return fixture
  }

  it('shows usage and monitoring tabs when the monitoring feature is enabled', async () => {
    const fixture = await createComponent()
    const text = (fixture.nativeElement as HTMLElement).textContent ?? ''

    expect(fixture.componentInstance.hasFeatureEnabled(COPILOT_MONITORING_FEATURE)).toBe(true)
    expect(text).toContain('PAC.Copilot.UserUsage')
    expect(text).toContain('PAC.Copilot.Monitoring')
  })

  it('hides usage and monitoring tabs when the monitoring feature is disabled', async () => {
    monitoringEnabled = false

    const fixture = await createComponent()
    const text = (fixture.nativeElement as HTMLElement).textContent ?? ''

    expect(fixture.componentInstance.hasFeatureEnabled(COPILOT_MONITORING_FEATURE)).toBe(false)
    expect(text).not.toContain('PAC.Copilot.UserUsage')
    expect(text).not.toContain('PAC.Copilot.OrgUsage')
    expect(text).not.toContain('PAC.Copilot.Monitoring')
  })
})
