import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { Store } from '@cloud/app/@core/state'
import { SkillPackageService } from 'apps/cloud/src/app/@core'
import { XpertSkillSelectComponent } from './skill.component'

jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

describe('XpertSkillSelectComponent role labels', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XpertSkillSelectComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: { selectedWorkspace$: of({ id: 'workspace-1' }) } },
        {
          provide: SkillPackageService,
          useValue: {
            getAllByWorkspace: () =>
              of({
                items: [
                  {
                    id: 'role',
                    name: 'agency-role-id',
                    metadata: {
                      displayName: { en_US: 'Anthropologist', zh_Hans: '\u4eba\u7c7b\u5b66\u5bb6' },
                      description: { en_US: 'Cultural methods' }
                    }
                  },
                  { id: 'legacy', name: 'legacy-skill', metadata: {} }
                ]
              })
          }
        }
      ]
    }).compileComponents()
    TestBed.inject(TranslateService).use('zh-Hans')
  })

  afterEach(() => TestBed.resetTestingModule())

  it('renders localized role names and falls back to technical names for old skills', fakeAsync(() => {
    const fixture = TestBed.createComponent(XpertSkillSelectComponent)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.textContent).toContain('\u4eba\u7c7b\u5b66\u5bb6')
    expect(element.textContent).toContain('legacy-skill')
    expect(element.textContent).not.toContain('agency-role-id')
    TestBed.inject(TranslateService).use('en-US')
    fixture.detectChanges()
    expect(element.textContent).toContain('Anthropologist')
  }))

  it('searches localized names and technical identifiers without changing skill selection', fakeAsync(() => {
    const fixture = TestBed.createComponent(XpertSkillSelectComponent)
    // Exercise filtering independently of the shared debounce timer.
    Object.defineProperty(fixture.componentInstance, 'searchTerm', { value: fixture.componentInstance.search })
    fixture.detectChanges()
    tick(350)
    fixture.detectChanges()
    const component = fixture.componentInstance
    component.writeValue(['role'])
    for (const query of ['\u4eba\u7c7b\u5b66\u5bb6', 'agency-role-id']) {
      component.search.set(query)
      fixture.detectChanges()
      tick(350)
      expect(component.search()).toBe(query)
      expect(component.searchTerm()).toBe(query)
      expect(component.skillList().map((skill) => skill.id)).toEqual(['role'])
      expect(component.skills()).toEqual(['role'])
    }
  }))
})
