import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { PluginApplicationUpdateProgress } from '@xpert-ai/contracts'
import { ApplicationUpdateComponent } from './app-update.component'
import { PluginApplicationService } from '@cloud/app/@core'

jest.mock('@cloud/app/@core', () => ({
  PluginApplicationService: class PluginApplicationService {},
  getErrorMessage: (error: Error) => error.message
}))
const input = { pluginName: 'plugin', appName: 'app', installationScope: 'organization' as const }
const failed: PluginApplicationUpdateProgress = {
  operationId: '5ba81aa5-978e-4664-9f81-f66dcd3e5ddb',
  status: 'failed',
  updatedAt: '2026-10-25',
  errorCode: 'UPDATE_FAILED',
  completed: 1,
  total: 2,
  entries: [
    { key: 'child', stage: 'published' },
    { key: '@main', stage: 'publishing' }
  ]
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
describe('App update progress and recovery', () => {
  const service = { getUpdateProgress: jest.fn(), updateApplication: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    service.getUpdateProgress.mockReturnValue(of(failed))
    service.updateApplication.mockReturnValue(of({ ...failed, status: 'completed' }))
    await TestBed.configureTestingModule({
      imports: [ApplicationUpdateComponent, TranslateModule.forRoot()],
      providers: [{ provide: PluginApplicationService, useValue: service }]
    }).compileComponents()
  })
  afterEach(() => TestBed.resetTestingModule())
  async function mount() {
    const fixture = TestBed.createComponent(ApplicationUpdateComponent)
    fixture.componentRef.setInput('application', input)
    fixture.detectChanges()
    await settle()
    fixture.detectChanges()
    return fixture
  }
  it('restores durable progress on mount and resumes the exact operation', async () => {
    const fixture = await mount()
    expect(fixture.componentInstance.progress()?.completed).toBe(1)
    expect(fixture.nativeElement.querySelector('progress').value).toBe(1)
    expect(fixture.nativeElement.textContent).toContain('XP.Explore.Application.Update.Resume')
    await fixture.componentInstance.update()
    expect(service.updateApplication).toHaveBeenCalledWith({ ...input, operationId: failed.operationId, resume: true })
  })
  it('retains checkpoints and shows failure without resending a completed child update', async () => {
    service.updateApplication.mockReturnValue(throwError(() => new Error('Update stopped')))
    const fixture = await mount()
    await fixture.componentInstance.update()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Update stopped')
    expect(fixture.componentInstance.progress()?.operationId).toBe(failed.operationId)
    expect(service.updateApplication).toHaveBeenCalledTimes(1)
  })
  it('ignores a previous organization response when the selected installation changes', async () => {
    const pending = new Subject<PluginApplicationUpdateProgress>()
    service.getUpdateProgress.mockReturnValueOnce(pending).mockReturnValue(of(null))
    const fixture = TestBed.createComponent(ApplicationUpdateComponent)
    fixture.componentRef.setInput('application', input)
    fixture.detectChanges()
    fixture.componentRef.setInput('application', { ...input, installationScope: 'personal' })
    fixture.detectChanges()
    await settle()
    pending.next(failed)
    pending.complete()
    await settle()
    expect(fixture.componentInstance.progress()).toBeNull()
  })
})
