import { ElementRef, NgZone, SimpleChange } from '@angular/core'
import { init } from 'echarts'

import { EchartsDirective } from './echarts.directive'

jest.mock('echarts', () => ({
  init: jest.fn()
}))

describe(EchartsDirective.name, () => {
  const chart = {
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
    on: jest.fn(),
    resize: jest.fn(),
    setOption: jest.fn()
  }
  const resizeObserver = {
    disconnect: jest.fn(),
    observe: jest.fn()
  }
  const zone = {
    run: (callback: () => unknown) => callback(),
    runOutsideAngular: (callback: () => unknown) => callback()
  } as NgZone

  let directive: EchartsDirective

  beforeEach(() => {
    jest.clearAllMocks()
    ;(init as jest.Mock).mockReturnValue(chart)
    global.ResizeObserver = jest.fn(() => resizeObserver) as unknown as typeof ResizeObserver
    directive = new EchartsDirective(new ElementRef(document.createElement('div')), zone)
  })

  it('initializes the chart and applies the initial options', () => {
    const options = { series: [{ type: 'pie', data: [1] }] }
    directive.options = options

    directive.ngAfterViewInit()

    expect(init).toHaveBeenCalledTimes(1)
    expect(chart.setOption).toHaveBeenCalledWith(options, { notMerge: true })
    expect(resizeObserver.observe).toHaveBeenCalledTimes(1)
  })

  it('updates options and releases browser resources', () => {
    directive.ngAfterViewInit()
    directive.options = { series: [{ type: 'bar', data: [2] }] }

    directive.ngOnChanges({
      options: new SimpleChange(null, directive.options, false)
    })
    directive.ngOnDestroy()

    expect(chart.setOption).toHaveBeenCalledWith(directive.options, { notMerge: true })
    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1)
    expect(chart.dispose).toHaveBeenCalledTimes(1)
  })

  it('forwards chart click events inside the Angular zone', () => {
    const emit = jest.spyOn(directive.chartClick, 'emit')
    directive.ngAfterViewInit()
    const clickHandler = chart.on.mock.calls.find(([event]) => event === 'click')?.[1]

    clickHandler?.({ name: 'node' })

    expect(emit).toHaveBeenCalledWith({ name: 'node' })
  })
})
