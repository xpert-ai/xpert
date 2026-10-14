import { Dialog } from '@angular/cdk/dialog'
import { BreakpointObserver } from '@angular/cdk/layout'
import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import type { AssistantTemplateOverview } from '@xpert-ai/contracts'
import { XpertTemplateService } from '@cloud/app/@core'
import { ExploreScopeService } from '../explore-scope.service'
import { TemplateDetailComponent } from './template-detail.component'

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
  const api = { getOverview: jest.fn() }
  const scope = { key: signal('org-a'), isTenant: jest.fn(() => false), choose: jest.fn() }
  const dialog = { open: jest.fn(() => ({ closed: of(undefined) })) }
  beforeEach(async () => {
    jest.clearAllMocks()
    scope.key.set('org-a')
    scope.isTenant.mockReturnValue(false)
    api.getOverview.mockReturnValue(of(overview))
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
          imports: [TranslateModule],
          schemas: [NO_ERRORS_SCHEMA]
        }
      })
      .compileComponents()
  })
  it('browses four sections and legacy empty states without opening installation', async () => {
    const fixture = TestBed.createComponent(TemplateDetailComponent)
    fixture.detectChanges()
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
