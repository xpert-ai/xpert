import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { Store } from '../../@core'
import { WorkspaceConnectionPageComponent } from './workspace-connection-page.component'

const mockConnect = jest.fn()
jest.mock('./workspace-connector-connect.runtime', () => ({ injectWorkspaceConnectorConnect: () => mockConnect }))
jest.mock('../../@core', () => ({ Store: class {}, getErrorMessage: (error: Error) => error.message }))

describe('Desktop workspace connection handoff', () => {
  const query = new BehaviorSubject(
    convertToParamMap({ assistantId: 'assistant', bindingId: 'binding', organizationId: 'organization' })
  )
  const organization = new BehaviorSubject('organization')
  beforeEach(() => {
    mockConnect.mockReset()
    organization.next('organization')
    query.next(convertToParamMap({ assistantId: 'assistant', bindingId: 'binding', organizationId: 'organization' }))
    TestBed.configureTestingModule({
      imports: [WorkspaceConnectionPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query.value }, queryParamMap: query } },
        { provide: Store, useValue: { organizationId: 'organization', selectOrganizationId: () => organization } }
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())
  it('delegates configuration to the existing shared connection flow only after an explicit action', async () => {
    mockConnect.mockResolvedValue({ status: 'connected' })
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    expect(mockConnect).not.toHaveBeenCalled()
    await fixture.componentInstance.connect()
    expect(mockConnect).toHaveBeenCalledWith({ assistantId: 'assistant', bindingId: 'binding' })
    expect(fixture.componentInstance.connected()).toBe(true)
  })
  it('requires the organization requested by Desktop', async () => {
    organization.next('other')
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    await fixture.componentInstance.connect()
    expect(mockConnect).not.toHaveBeenCalled()
    expect(fixture.componentInstance.assistantId()).toBeNull()
  })
  it('shows an incomplete-link message without starting or offering an invalid connection', () => {
    query.next(convertToParamMap({ organizationId: 'organization', assistantId: 'assistant', autostart: '1' }))
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    expect(mockConnect).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('ConnectionInvalidLink')
    expect(fixture.nativeElement.querySelector('button')).toBeNull()
  })
  it('opens the exact connection automatically for a Desktop handoff, without a second confirmation button', async () => {
    query.next(
      convertToParamMap({
        assistantId: 'assistant',
        bindingId: 'binding',
        organizationId: 'organization',
        autostart: '1'
      })
    )
    mockConnect.mockReturnValue(new Promise(() => {}))
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    expect(mockConnect).toHaveBeenCalledWith({ assistantId: 'assistant', bindingId: 'binding' })
    expect(fixture.componentInstance.busy()).toBe(true)
    expect(fixture.nativeElement.querySelector('button')).toBeNull()
    fixture.detectChanges()
    expect(mockConnect).toHaveBeenCalledTimes(1)
  })
  it('waits for matching organization context before starting automatically', () => {
    query.next(
      convertToParamMap({
        assistantId: 'assistant',
        bindingId: 'binding',
        organizationId: 'organization',
        autostart: '1'
      })
    )
    organization.next('other')
    mockConnect.mockReturnValue(new Promise(() => {}))
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    expect(mockConnect).not.toHaveBeenCalled()
    organization.next('organization')
    fixture.detectChanges()
    expect(mockConnect).toHaveBeenCalledTimes(1)
  })
  it('discards a late success after switching organizations', async () => {
    let resolve: (value: { status: string }) => void
    mockConnect.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const fixture = TestBed.createComponent(WorkspaceConnectionPageComponent)
    fixture.detectChanges()
    const request = fixture.componentInstance.connect()
    organization.next('other')
    fixture.detectChanges()
    resolve({ status: 'connected' })
    await request
    expect(fixture.componentInstance.connected()).toBe(false)
    expect(fixture.componentInstance.busy()).toBe(false)
  })
})
