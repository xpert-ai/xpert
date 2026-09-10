import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, RouterPreloader, withPreloading } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { firstValueFrom } from 'rxjs'
import { SelectivePreloadingStrategy } from './selective-preloading-strategy'

@Component({ standalone: true, selector: 'xp-reading-stub', template: 'Reading' })
class ReadingStub {}
@Component({ standalone: true, selector: 'xp-graph-stub', template: 'Graph' })
class GraphStub {}

describe('Selective route preloading', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('preloads ordinary routes but loads an opted-out graph only on navigation', async () => {
    const graph = jest.fn(async () => GraphStub)
    const ordinary = jest.fn(async () => ReadingStub)
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', component: ReadingStub },
            { path: 'ordinary', loadComponent: ordinary },
            { path: 'graph', data: { preload: false }, loadComponent: graph }
          ],
          withPreloading(SelectivePreloadingStrategy)
        )
      ]
    })
    const harness = await RouterTestingHarness.create('/')
    await firstValueFrom(TestBed.inject(RouterPreloader).preload())
    expect(ordinary).toHaveBeenCalledTimes(1)
    expect(graph).not.toHaveBeenCalled()
    await harness.navigateByUrl('/graph', GraphStub)
    expect(graph).toHaveBeenCalledTimes(1)
    expect(harness.routeNativeElement?.textContent).toBe('Graph')
  })
})
