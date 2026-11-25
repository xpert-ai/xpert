import * as React from 'react'
import { createRoot } from 'react-dom/client'
export { flushSync } from 'react-dom'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose
} from '../src/components/ui/dialog'
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose } from '../src/components/ui/sheet'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../src/components/ui/select'

export function mount(
  container: HTMLElement,
  {
    kind = 'dialog',
    blockOutside = false
  }: {
    kind?: 'dialog' | 'sheet'
    blockOutside?: boolean
  } = {}
) {
  const events: string[] = []
  const Root = kind === 'sheet' ? Sheet : Dialog
  const Trigger = kind === 'sheet' ? SheetTrigger : DialogTrigger
  const Content = kind === 'sheet' ? SheetContent : DialogContent
  const Title = kind === 'sheet' ? SheetTitle : DialogTitle
  const Description = kind === 'sheet' ? SheetDescription : DialogDescription
  const Close = kind === 'sheet' ? SheetClose : DialogClose
  function Preview() {
    const [open, setOpen] = React.useState(true)
    const [choice, setChoice] = React.useState('')
    const ref = React.useRef<HTMLDivElement>(null)
    return (
      <main className="p-8">
        <h1>Isolated overlay regression</h1>
        <p data-testid="state">{open ? 'Dialog remains open' : 'Dialog closed'}</p>
        <Root
          open={open}
          onOpenChange={(value) => {
            events.push(`parent:${value}`)
            setOpen(value)
          }}
        >
          <Trigger asChild>
            <button>Open parent</button>
          </Trigger>
          <Content
            ref={ref}
            data-testid="parent"
            className="p-6 sm:max-w-xl"
            onPointerDownOutside={(event) => {
              events.push(`outside:${event.defaultPrevented}`)
              if (blockOutside) event.preventDefault()
            }}
          >
            <Title>Local approval preview</Title>
            <Description>Interaction test only. No business data or API requests.</Description>
            <div aria-label="Dialog blank area" data-testid="blank" className="h-24">
              Blank area
            </div>
            <Select value={choice} onValueChange={setChoice} onOpenChange={(value) => events.push(`select:${value}`)}>
              <SelectTrigger aria-label="Decision">
                <SelectValue placeholder="Choose a result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">Approve</SelectItem>
                <SelectItem value="revise">Request changes</SelectItem>
              </SelectContent>
            </Select>
            <label>
              Notes
              <input aria-label="Notes" className="ml-2 border" />
            </label>
            <Dialog>
              <DialogTrigger asChild>
                <button>Open child</button>
              </DialogTrigger>
              <DialogContent data-testid="child">
                <DialogTitle>Child dialog</DialogTitle>
                <DialogDescription>Nested dismissal test.</DialogDescription>
                <DialogClose asChild>
                  <button>Close child</button>
                </DialogClose>
              </DialogContent>
            </Dialog>
            <Close asChild>
              <button>Close parent</button>
            </Close>
          </Content>
        </Root>
      </main>
    )
  }
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <Preview />
    </React.StrictMode>
  )
  return { events, unmount: () => root.unmount() }
}
