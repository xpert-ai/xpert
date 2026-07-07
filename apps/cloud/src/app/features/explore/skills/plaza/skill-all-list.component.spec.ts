import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SkillAllListComponent } from './skill-all-list.component'
import type { ISkillRepositoryIndex } from '@cloud/app/@core'

function createSkill(overrides: Partial<ISkillRepositoryIndex> = {}): ISkillRepositoryIndex {
  return {
    id: 'skill-1',
    repositoryId: 'repo-1',
    skillId: 'skills/api-generator',
    skillPath: 'skills/api-generator',
    name: 'API 接口生成',
    description: '根据需求自动生成接口文档与代码',
    tags: ['工程开发', 'api'],
    stats: {
      downloads: 860
    },
    ...overrides
  }
}

describe('SkillAllListComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders the empty state when there are no skills', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SkillAllListComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(SkillAllListComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Explore.NoSkills')
  })

  it('renders skills and emits view/install/load-more events', async () => {
    const item = createSkill()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), SkillAllListComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(SkillAllListComponent)
    const viewed: ISkillRepositoryIndex[] = []
    const installed: ISkillRepositoryIndex[] = []
    let loadMoreCount = 0
    fixture.componentRef.setInput('items', [item])
    fixture.componentRef.setInput('hasMore', true)
    fixture.componentInstance.view.subscribe((skill) => viewed.push(skill))
    fixture.componentInstance.install.subscribe((skill) => installed.push(skill))
    fixture.componentInstance.loadMore.subscribe(() => (loadMoreCount += 1))
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('API 接口生成')
    expect(fixture.nativeElement.textContent).toContain('860')

    fixture.nativeElement.querySelector('z-card').click()
    fixture.detectChanges()
    expect(viewed).toEqual([item])

    const buttons = fixture.nativeElement.querySelectorAll('button')
    buttons[0].click()
    fixture.detectChanges()
    expect(installed).toEqual([item])

    buttons[1].click()
    fixture.detectChanges()
    expect(loadMoreCount).toBe(1)
  })
})
