import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SkillHotStripComponent } from './skill-hot-strip.component'
import type { SkillHotCardViewModel } from './skill-plaza.models'

const hotSkill: SkillHotCardViewModel = {
  item: {
    id: 'skill-1',
    repositoryId: 'repo-1',
    skillId: 'skills/hot',
    skillPath: 'skills/hot',
    name: '热门技能',
    description: '自动整理销售线索',
    tags: ['销售'],
    stats: {
      downloads: 2100,
      stars: 18
    }
  },
  title: '热门技能',
  description: '自动整理销售线索',
  downloads: 2100,
  stars: 18,
  score: 2280
}

describe('SkillHotStripComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders hot skill stats and emits view events', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SkillHotStripComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(SkillHotStripComponent)
    const viewed: SkillHotCardViewModel[] = []
    let viewMoreCount = 0
    fixture.componentRef.setInput('items', [hotSkill])
    fixture.componentInstance.view.subscribe((item) => viewed.push(item))
    fixture.componentInstance.viewMore.subscribe(() => (viewMoreCount += 1))
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('热门技能')
    expect(fixture.nativeElement.textContent).toContain('2100')

    fixture.nativeElement.querySelector('z-card').click()
    fixture.detectChanges()
    expect(viewed).toEqual([hotSkill])

    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    expect(viewMoreCount).toBe(1)
  })
})
