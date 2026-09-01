import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of, throwError } from 'rxjs'
import {
  EnvironmentService,
  KnowledgebaseService,
  SkillPackageService,
  XpertAPIService,
  XpertToolsetService
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceSettingsPageComponent } from './settings-page.component'

function createItems(length: number) {
  return Array.from({ length }, (_, index) => ({ id: String(index + 1) }))
}

async function setup(options?: { skillsFail?: boolean }) {
  const workspace = signal({
    id: 'workspace-1',
    name: 'Demo Workspace',
    description: '用于产品演示的工作区',
    status: 'active' as const,
    updatedAt: new Date('2026-05-18T08:45:46.000Z')
  })
  const xpertService = { getAllByWorkspace: jest.fn(() => of({ items: createItems(3) })) }
  const skillPackageService = {
    getAllByWorkspace: jest.fn(() =>
      options?.skillsFail ? throwError(() => new Error('skills unavailable')) : of({ items: createItems(22) })
    )
  }
  const environmentService = {
    getAllInOrg: jest.fn(() => new BehaviorSubject({ items: createItems(1) }))
  }
  const toolsetService = { getAllByWorkspace: jest.fn(() => of({ items: createItems(2) })) }
  const knowledgebaseService = { getAllByWorkspaceOnly: jest.fn(() => of({ items: createItems(4) })) }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [XpertWorkspaceSettingsPageComponent],
    providers: [
      { provide: XpertWorkspaceHomeComponent, useValue: { workspace } },
      { provide: XpertAPIService, useValue: xpertService },
      { provide: SkillPackageService, useValue: skillPackageService },
      { provide: EnvironmentService, useValue: environmentService },
      { provide: XpertToolsetService, useValue: toolsetService },
      { provide: KnowledgebaseService, useValue: knowledgebaseService }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertWorkspaceSettingsPageComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    fixture,
    xpertService,
    skillPackageService,
    environmentService,
    toolsetService,
    knowledgebaseService
  }
}

describe('XpertWorkspaceSettingsPageComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders workspace overview information and real resource counts', async () => {
    const { fixture, xpertService, skillPackageService, environmentService, toolsetService, knowledgebaseService } =
      await setup()
    const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ')

    expect(text).toContain('AI 工作空间')
    expect(text).toContain('Demo Workspace')
    expect(text).toContain('查看当前 AI 工作空间的资源分布与运行状态。')
    expect(text).toContain('业务助理3')
    expect(text).toContain('技能22')
    expect(text).toContain('环境变量1')
    expect(text).toContain('MCP工具2')
    expect(text).toContain('知识库4')
    expect(text).toContain('工作空间状态已启用')
    expect(text).toContain('用于产品演示的工作区')

    expect(xpertService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', {
      where: { type: 'agent', latest: true },
      take: 1000
    })
    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', { take: 1000 })
    expect(environmentService.getAllInOrg).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      take: 1000
    })
    expect(toolsetService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', {
      where: { category: 'mcp' },
      take: 1000
    })
    expect(knowledgebaseService.getAllByWorkspaceOnly).toHaveBeenCalledWith('workspace-1', { take: 1000 })

    fixture.destroy()
  })

  it('keeps the overview available when one resource count fails', async () => {
    const { fixture } = await setup({ skillsFail: true })
    const metrics = Array.from(fixture.nativeElement.querySelectorAll('.workspace-metric')).map((element: Element) =>
      element.textContent.replace(/\s+/g, ' ').trim()
    )

    expect(metrics).toEqual(['业务助理3', '技能—', '环境变量1', 'MCP工具2', '知识库4'])
    expect(fixture.nativeElement.textContent).toContain('Demo Workspace')

    fixture.destroy()
  })
})
