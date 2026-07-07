import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { of } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'

jest.mock('@cloud/app/@core', () => {
  class SkillPackageService {}
  class SkillRepositoryIndexService {}
  class SkillRepositoryService {}
  class ToastrService {}
  class XpertTemplateService {}
  class XpertWorkspaceService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    injectToastr: () => ({
      error: jest.fn(),
      success: jest.fn()
    }),
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    SkillPackageService,
    SkillRepositoryIndexService,
    SkillRepositoryService,
    ToastrService,
    XpertTemplateService,
    XpertWorkspaceService
  }
})

import {
  SkillPackageService,
  SkillRepositoryIndexService,
  SkillRepositoryService,
  ToastrService,
  XpertTemplateService
} from '@cloud/app/@core'
import { ExploreSkillsComponent } from './skills.component'

function createLocalSkill() {
  return {
    id: 'local-skill-1',
    name: 'workspace-weather',
    publishAt: new Date('2026-04-09T10:00:00.000Z'),
    metadata: {
      displayName: {
        en_US: 'Workspace Weather'
      },
      description: {
        en_US: 'Shared from workspace'
      },
      tags: ['weather'],
      visibility: 'private'
    }
  }
}

function createRepositorySkill() {
  return {
    id: 'repo-skill-1',
    name: 'installed-from-market',
    metadata: {
      displayName: {
        en_US: 'Installed From Market'
      },
      description: {
        en_US: 'Installed from repository'
      },
      visibility: 'private'
    },
    skillIndex: {
      id: 'index-1',
      skillId: 'market/installed',
      skillPath: 'market/installed',
      name: 'Installed From Market',
      repository: {
        id: 'repo-1',
        provider: 'github',
        name: 'anthropics/skills'
      }
    }
  }
}

describe('ExploreSkillsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('shows share CTA only for workspace uploaded skills and does not trigger card navigation when sharing', async () => {
    const dialog = {
      open: jest.fn(() => ({
        closed: of(null)
      }))
    }
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillsComponent],
      providers: [
        provideRouter([]),
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: SkillRepositoryService,
          useValue: {
            getAvailables: jest.fn(() => of({ items: [{ id: 'repo-1', name: 'Default Repository' }] }))
          }
        },
        {
          provide: SkillRepositoryIndexService,
          useValue: {
            getMarketplace: jest.fn(() => of({ items: [], total: 0 }))
          }
        },
        {
          provide: XpertTemplateService,
          useValue: {
            getSkillsMarket: jest.fn(() => of(null))
          }
        },
        {
          provide: SkillPackageService,
          useValue: {
            getAllByWorkspace: jest.fn(() =>
              of({
                items: [createLocalSkill(), createRepositorySkill()]
              })
            )
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const routerNavigate = jest.spyOn(TestBed.inject(Router), 'navigate')
    const fixture = TestBed.createComponent(ExploreSkillsComponent)
    fixture.componentRef.setInput('mode', 'mine')
    fixture.componentRef.setInput('workspace', {
      id: 'workspace-1',
      name: 'Default Workspace'
    })
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const shareButtons = Array.from(fixture.nativeElement.querySelectorAll('button')).filter(
      (button): button is HTMLButtonElement =>
        button.textContent?.includes('PAC.Explore.ShareSkill') ||
        button.textContent?.includes('PAC.Explore.RepublishSkill') ||
        false
    )

    expect(shareButtons).toHaveLength(1)

    shareButtons[0].click()
    fixture.detectChanges()

    expect(dialog.open).toHaveBeenCalledTimes(1)
    expect(routerNavigate).not.toHaveBeenCalled()
  })

  it('switches to repository install tab when the create menu requests it', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillsComponent],
      providers: [
        provideRouter([]),
        {
          provide: Dialog,
          useValue: {
            open: jest.fn(() => ({
              closed: of(null)
            }))
          }
        },
        {
          provide: SkillRepositoryService,
          useValue: {
            getAvailables: jest.fn(() => of({ items: [{ id: 'repo-1', name: 'Default Repository' }] }))
          }
        },
        {
          provide: SkillRepositoryIndexService,
          useValue: {
            getMarketplace: jest.fn(() => of({ items: [], total: 0 }))
          }
        },
        {
          provide: XpertTemplateService,
          useValue: {
            getSkillsMarket: jest.fn(() => of(null))
          }
        },
        {
          provide: SkillPackageService,
          useValue: {
            getAllByWorkspace: jest.fn(() => of({ items: [] }))
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreSkillsComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    fixture.componentRef.setInput('installFromRepositoryNonce', 1)
    fixture.detectChanges()

    expect(fixture.componentInstance.activePlazaTab()).toBe('enterprise')
  })
})
