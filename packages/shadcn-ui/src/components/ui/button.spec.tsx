import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Button } from './button'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import { TooltipProvider, Tooltip, TooltipTrigger } from './tooltip'

describe('React 18 overlay trigger refs', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
  })
  it('forwards the real button node used by Radix to measure its anchor', () => {
    const ref = React.createRef<HTMLButtonElement>()
    React.act(() => root.render(<Button ref={ref}>Display</Button>))
    expect(ref.current).toBe(container.querySelector('button'))
    expect(ref.current).not.toBeNull()
  })
  it('preserves the ref through composed Tooltip and Popover triggers', () => {
    const ref = React.createRef<HTMLButtonElement>()
    React.act(() =>
      root.render(
        <TooltipProvider>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild ref={ref}>
                  <Button>Display</Button>
                </PopoverTrigger>
              </TooltipTrigger>
            </Tooltip>
            <PopoverContent aria-label="Display settings">Node style</PopoverContent>
          </Popover>
        </TooltipProvider>
      )
    )
    const button = container.querySelector('button')!
    expect(ref.current).toBe(button)
    React.act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[aria-label="Display settings"]')?.getAttribute('data-state')).toBe('open')
    React.act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })
})
