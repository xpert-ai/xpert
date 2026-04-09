import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ISkillMarketFeaturedSkill, ISkillRepositoryIndex } from '@cloud/app/@core'
import { ExploreSkillCardComponent } from './skill-card.component'

function createSkillIndex(overrides: Partial<ISkillRepositoryIndex> = {}): ISkillRepositoryIndex {
  return {
    id: 'skill-1',
    repositoryId: 'repo-1',
    skillId: 'skills/test-skill',
    skillPath: 'skills/test-skill',
    name: 'Test Skill',
    description: 'Test skill description',
    publisher: {
      displayName: 'Skill Creator',
      handle: 'skill-creator',
      image: 'https://example.com/creator.png'
    },
    tags: ['test'],
    ...overrides
  }
}

describe('ExploreSkillCardComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders a featured avatar icon when the featured skill provides one', async () => {
    const item = createSkillIndex()
    const featured: ISkillMarketFeaturedSkill = {
      provider: 'github',
      repositoryName: 'anthropics/skills',
      skillId: item.skillId,
      avatar: {
        type: 'font',
        value: 'ri-code-box-line',
        size: 22
      },
      skill: item
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillCardComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreSkillCardComponent)
    fixture.componentRef.setInput('item', item)
    fixture.componentRef.setInput('featured', featured)
    fixture.componentRef.setInput('variant', 'featured')
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-icon"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('.ri-code-box-line')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-image"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-fallback"]')).toBeNull()
  })

  it('renders the publisher image for repository skills without a featured avatar', async () => {
    const item = createSkillIndex()

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillCardComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreSkillCardComponent)
    fixture.componentRef.setInput('item', item)
    fixture.detectChanges()

    const avatarImage = fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-image"]') as HTMLImageElement

    expect(avatarImage).not.toBeNull()
    expect(avatarImage.getAttribute('src')).toBe('https://example.com/creator.png')
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-icon"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-fallback"]')).toBeNull()
  })

  it('renders the publisher initial when neither featured nor publisher avatars are available', async () => {
    const item = createSkillIndex({
      publisher: {
        displayName: 'Fallback Creator'
      }
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillCardComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreSkillCardComponent)
    fixture.componentRef.setInput('item', item)
    fixture.detectChanges()

    const fallback = fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-fallback"]') as HTMLElement

    expect(fallback).not.toBeNull()
    expect(fallback.textContent?.trim()).toBe('F')
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-icon"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-testid="skill-card-avatar-image"]')).toBeNull()
  })
})
