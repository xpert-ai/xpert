import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SkillFeaturedGridComponent } from './skill-featured-grid.component'
import type { ISkillMarketFeaturedSkill } from '@cloud/app/@core'

const featuredSkill: ISkillMarketFeaturedSkill = {
  provider: 'github',
  repositoryName: 'xpert/skills',
  skillId: 'skills/knowledge-assistant',
  title: '知识库问答助手',
  description: '基于企业知识库快速检索并生成准确答案',
  badge: '官方',
  avatar: {
    type: 'emoji',
    value: 'K'
  },
  skill: {
    id: 'skill-1',
    repositoryId: 'repo-1',
    skillId: 'skills/knowledge-assistant',
    skillPath: 'skills/knowledge-assistant',
    name: 'knowledge-assistant',
    description: '知识库问答',
    tags: ['知识库', '问答'],
    stats: {
      downloads: 2400
    }
  }
}

describe('SkillFeaturedGridComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders featured skills and emits view/install events', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SkillFeaturedGridComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(SkillFeaturedGridComponent)
    const viewed: ISkillMarketFeaturedSkill[] = []
    const installed: ISkillMarketFeaturedSkill[] = []
    fixture.componentRef.setInput('items', [featuredSkill])
    fixture.componentInstance.view.subscribe((item) => viewed.push(item))
    fixture.componentInstance.install.subscribe((item) => installed.push(item))
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('知识库问答助手')
    expect(fixture.nativeElement.textContent).toContain('2400')

    fixture.nativeElement.querySelector('z-card').click()
    fixture.detectChanges()
    expect(viewed).toEqual([featuredSkill])

    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    expect(installed).toEqual([featuredSkill])
  })
})
