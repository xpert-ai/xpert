import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SkillPlazaTabsComponent } from './skill-plaza-tabs.component'
import type { SkillPlazaTab } from './skill-plaza.models'

describe('SkillPlazaTabsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders tab counts and emits the selected tab', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SkillPlazaTabsComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(SkillPlazaTabsComponent)
    const selected: SkillPlazaTab[] = []
    fixture.componentRef.setInput('active', 'featured')
    fixture.componentRef.setInput('featuredCount', 6)
    fixture.componentRef.setInput('enterpriseCount', 12)
    fixture.componentRef.setInput('favoritesCount', 2)
    fixture.componentInstance.activeChange.subscribe((tab) => selected.push(tab))
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent
    expect(text).toContain('PAC.Explore.OfficialFeatured')
    expect(text).toContain('PAC.Explore.EnterpriseArea')
    expect(text).toContain('PAC.Explore.MyFavorites')
    expect(text).toContain('12')

    const buttons = fixture.nativeElement.querySelectorAll('button')
    buttons[1].click()
    fixture.detectChanges()

    expect(selected).toEqual(['enterprise'])
  })
})
