import * as React from 'react'
import { HoverCard as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const HoverCard = Primitive.Root
export const HoverCardTrigger = Primitive.Trigger
export function HoverCardContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-xl border bg-popover p-3 text-popover-foreground shadow-md outline-none',
          className
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}
