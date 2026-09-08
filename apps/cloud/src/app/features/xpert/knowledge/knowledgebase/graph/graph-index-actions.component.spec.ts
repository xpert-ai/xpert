import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import {
  KnowledgebaseService,
  KnowledgeGraphStatus,
  KnowledgeGraphStatusResponse,
  ToastrService
} from '../../../../../@core'
import { KnowledgeGraphIndexActionsComponent } from './graph-index-actions.component'

describe('KnowledgeGraphIndexActionsComponent', () => {
  let fixture: ComponentFixture<KnowledgeGraphIndexActionsComponent>
  const service = { rebuildGraph: jest.fn(), getGraphStatus: jest.fn() }
  const toastr = { success: jest.fn(), error: jest.fn() }

  function status(state: KnowledgeGraphStatus, enabled = true): KnowledgeGraphStatusResponse {
    return {
      status: state,
      enabled,
      entityCount: 0,
      relationCount: 0,
      mentionCount: 0,
      queuedJobCount: 0,
      runningJobCount: 0,
      failedJobCount: 0
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgeGraphIndexActionsComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: KnowledgebaseService, useValue: service },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    service.rebuildGraph.mockReturnValue(of([]))
    service.getGraphStatus.mockReturnValue(of(status(KnowledgeGraphStatus.READY)))
    fixture = TestBed.createComponent(KnowledgeGraphIndexActionsComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb-1')
  })

  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('makes rebuilding available for enabled pending graphs without starting it automatically', () => {
    fixture.componentRef.setInput('status', status(KnowledgeGraphStatus.REBUILD_REQUIRED))
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false)
    expect(service.rebuildGraph).not.toHaveBeenCalled()
    const completed = jest.fn()
    fixture.componentInstance.indexingComplete.subscribe(completed)
    fixture.nativeElement.querySelector('button').click()

    expect(service.rebuildGraph).toHaveBeenCalledWith('kb-1')
    expect(service.getGraphStatus).toHaveBeenCalledWith('kb-1')
    expect(completed).toHaveBeenCalledTimes(1)
  })

  it('does not rebuild a disabled graph', () => {
    fixture.componentRef.setInput('status', status(KnowledgeGraphStatus.DISABLED, false))
    fixture.detectChanges()
    fixture.componentInstance.rebuild()

    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true)
    expect(service.rebuildGraph).not.toHaveBeenCalled()
  })

  it('polls a running build, publishes completion and stops polling', async () => {
    fixture.destroy()
    jest.useFakeTimers()
    fixture = TestBed.createComponent(KnowledgeGraphIndexActionsComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb-1')
    service.getGraphStatus.mockReturnValue(of(status(KnowledgeGraphStatus.READY)))
    fixture.componentRef.setInput('status', status(KnowledgeGraphStatus.INDEXING))
    fixture.detectChanges()
    TestBed.flushEffects()
    const completed = jest.fn()
    fixture.componentInstance.indexingComplete.subscribe(completed)

    await jest.advanceTimersByTimeAsync(2500)
    fixture.detectChanges()

    expect(fixture.componentInstance.status()?.status).toBe(KnowledgeGraphStatus.READY)
    expect(completed).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(5000)
    expect(service.getGraphStatus).toHaveBeenCalledTimes(1)
  })

  it('keeps rebuild available after a failed request and reports its error', () => {
    service.rebuildGraph.mockReturnValue(throwError(() => new Error('Cannot start build')))
    fixture.componentRef.setInput('status', status(KnowledgeGraphStatus.REBUILD_REQUIRED))
    fixture.detectChanges()
    fixture.componentInstance.rebuild()
    fixture.detectChanges()

    expect(toastr.error).toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false)
  })

  it('recovers polling after a temporary status error and reports the outage once', async () => {
    fixture.destroy()
    jest.useFakeTimers()
    fixture = TestBed.createComponent(KnowledgeGraphIndexActionsComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb-1')
    fixture.componentRef.setInput('status', status(KnowledgeGraphStatus.INDEXING))
    service.getGraphStatus
      .mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
      .mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
      .mockReturnValue(of(status(KnowledgeGraphStatus.READY)))
    fixture.detectChanges()
    TestBed.flushEffects()

    await jest.advanceTimersByTimeAsync(7500)
    fixture.detectChanges()

    expect(fixture.componentInstance.status()?.status).toBe(KnowledgeGraphStatus.READY)
    expect(toastr.error).toHaveBeenCalledTimes(1)
  })
})
