import * as React from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { ContextMenu as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const ContextMenu = Primitive.Root
const ContextMenuTrigger = Primitive.Trigger
const ContextMenuSub = Primitive.Sub
function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={cn(
          'z-50 min-w-56 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none',
          className
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}
function ContextMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
      {...props}
    />
  )
}
function ContextMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Primitive.SubTrigger>) {
  return (
    <Primitive.SubTrigger
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </Primitive.SubTrigger>
  )
}
function ContextMenuSubContent({ className, ...props }: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent
        className={cn(
          'z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none',
          className
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}
function ContextMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md py-2 pr-3 pl-9 text-sm outline-none select-none focus:bg-accent [&_svg]:size-4',
        className
      )}
      {...props}
    >
      <span className="absolute left-3">
        <Primitive.ItemIndicator>
          <Check />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.CheckboxItem>
  )
}
function ContextMenuSeparator(props: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className="-mx-1 my-1 h-px bg-border" {...props} />
}
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuSeparator
}
