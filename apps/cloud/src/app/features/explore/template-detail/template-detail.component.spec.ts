import { Dialog } from '@angular/cdk/dialog'
import { BreakpointObserver } from '@angular/cdk/layout'
import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import type { AssistantTemplateOverview, TemplateReadiness, XpertTemplateSetup } from '@xpert-ai/contracts'
import { XpertTemplateService } from '@cloud/app/@core'
import { ExploreScopeService } from '../explore-scope.service'
import { TemplateDetailComponent } from './template-detail.component'
import { TemplateRequirementsComponent } from './template-requirements.component'

jest.mock('@cloud/app/@core', () => ({
  XpertTemplateService: class {},
  XpertTypeEnum: { Agent: 'agent' },
  getErrorMessage: (error: Error) => error.message
}))
jest.mock('../../xpert/xpert', () => ({ XpertNewBlankComponent: class {} }))
jest.mock('../explore-scope.component', () => ({ ExploreScopeComponent: class {} }))

const overview: AssistantTemplateOverview = {
  id: 'office',
  title: 'Office',
  description: 'Office work',
  publisher: 'Author',
  instructions: 'Prepare drafts',
  memories: [],
  skills: [],
  agents: [],
  routines: [],
  integrations: []
}
describe('TemplateDetailComponent', () => {
  const api = { getOverview: jest.fn(), getSetup: jest.fn() }
  const scope = { key: signal('org-a'), isTenant: jest.fn(() => false), choose: jest.fn() }
  const dialog = { open: jest.fn(() => ({ closed: of(undefined) })) }
  beforeEach(async () => {
    jest.clearAllMocks()
    scope.key.set('org-a')
    scope.isTenant.mockReturnValue(false)
    api.getOverview.mockReturnValue(of(overview))
    api.getSetup.mockReturnValue(of({ readiness: undefined }))
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ templateId: 'office' })),
            snapshot: { paramMap: convertToParamMap({ templateId: 'office' }) }
          }
        },
        { provide: XpertTemplateService, useValue: api },
        { provide: ExploreScopeService, useValue: scope },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: true }) } },
        { provide: Dialog, useValue: dialog }
      ]
    })
      .overrideComponent(TemplateDetailComponent, {
        set: {
          imports: [TranslateModule, TemplateRequirementsComponent],
          schemas: [NO_ERRORS_SCHEMA]
        }
      })
      .compileComponents()
  })
  it('browses template sections and legacy empty states without opening installation', async () => {
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Prepare drafts')
    for (const key of ['NoMemories', 'NoSkills', 'NoRoutines', 'NoIntegrations'])
      expect(fixture.nativeElement.textContent).toContain(`TemplateOverview.${key}`)
    expect(dialog.open).not.toHaveBeenCalled()
    await fixture.componentInstance.install()
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ initialTemplateId: 'office' }) })
    )
  })
  it('discards stale responses after scope changes', async () => {
    const stale = new Subject<AssistantTemplateOverview>()
    api.getOverview.mockReturnValueOnce(stale)
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    api.getOverview.mockReturnValueOnce(of({ ...overview, title: 'Organization B' }))
    scope.key.set('org-b')
    fixture.detectChanges()
    await fixture.whenStable()
    stale.next(overview)
    await fixture.whenStable()
    expect(fixture.componentInstance.detail().title).toBe('Organization B')
  })
  it('reloads the selected organization before importing from tenant scope', async () => {
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    scope.isTenant.mockReturnValue(true)
    scope.choose.mockResolvedValue(true)
    api.getOverview.mockReturnValueOnce(of({ ...overview, id: 'scoped-template' }))
    await fixture.componentInstance.install()
    expect(scope.choose).toHaveBeenCalledWith(true)
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ initialTemplateId: 'scoped-template' })
      })
    )
  })
  it('shows requirements on the detail page without starting installation', async () => {
    const readiness: TemplateReadiness = {
      canInstall: true,
      legacy: false,
      manifestVersion: '1.0.3',
      checks: [{ kind: 'plugin', key: 'example-plugin', required: true, status: 'missing', message: 'Missing plugin' }],
      dependencies: [],
      files: { scope: 'user', entries: [{ kind: 'file', path: 'assistant/brief.md', version: '1' }] }
    }
    api.getSetup.mockReturnValue(of({ readiness }))
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(api.getSetup).toHaveBeenCalledWith('office')
    expect(fixture.nativeElement.textContent).toContain('example-plugin')
    expect(fixture.nativeElement.textContent).toContain('assistant/brief.md')
    expect(dialog.open).not.toHaveBeenCalled()
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    const manage = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((button) =>
      button.textContent.includes('XP.Installation.ManageDependencies')
    )
    manage.click()
    expect(navigate).toHaveBeenCalledWith(['/plugins'], { queryParams: { category: 'agent-plugins' } })
  })
  it('keeps the overview usable when requirements fail and allows retry', async () => {
    api.getSetup.mockReturnValueOnce(throwError(() => new Error('Requirements unavailable')))
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.detail()).toEqual(overview)
    expect(fixture.nativeElement.textContent).toContain('Requirements unavailable')
    await fixture.componentInstance.loadRequirements()
    expect(fixture.componentInstance.requirementsError()).toBe('')
  })
  it('does not inspect organization requirements in tenant scope', async () => {
    scope.isTenant.mockReturnValue(true)
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(api.getSetup).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).toContain('XP.Scope.SelectOrganization')
  })
  it('discards requirements from the previous organization', async () => {
    const stale = new Subject<XpertTemplateSetup>()
    api.getSetup.mockReturnValueOnce(stale)
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    scope.key.set('org-b')
    fixture.detectChanges()
    await fixture.whenStable()
    stale.error(new Error('Previous organization unavailable'))
    await fixture.whenStable()
    expect(fixture.componentInstance.requirementsError()).toBe('')
    expect(fixture.componentInstance.requirementsLoading()).toBe(false)
  })
  it('routes application-owned templates through governed application setup', async () => {
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.componentInstance.detail.set({
      ...overview,
      application: { appName: 'office', pluginName: '@test/office' }
    })
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    await fixture.componentInstance.install()
    expect(navigate).toHaveBeenCalledWith(['/explore/apps', 'office'], {
      queryParams: { plugin: '@test/office', setup: 1 }
    })
    expect(dialog.open).not.toHaveBeenCalled()
  })
})
