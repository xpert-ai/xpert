import { cva, type VariantProps } from 'class-variance-authority'

export const menuContentVariants = cva([
  'z-50 inline-flex min-w-40 flex-col overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1.5 text-popover-foreground',
  'shadow-xl backdrop-blur-sm animate-in data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95',
  'data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2'
])

export const menuItemVariants = cva(
  [
    'relative flex min-h-9 w-full cursor-default select-none items-center gap-2 rounded-lg px-3 py-2',
    'text-left text-sm outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground',
    'focus:bg-accent focus:text-accent-foreground data-[highlighted=true]:bg-accent',
    'data-[highlighted=true]:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
    'aria-[checked=true]:bg-accent aria-[checked=true]:font-medium [&>i]:mr-1 [&>i]:shrink-0 [&>z-icon]:mr-1 [&>z-icon]:shrink-0'
  ],
  {
    variants: {
      inset: {
        true: 'pl-8',
        false: ''
      },
      zType: {
        default: '',
        destructive:
          'text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive'
      }
    },
    defaultVariants: {
      inset: false
    }
  }
)

export const submenuArrowVariants = cva([
  'ml-auto opacity-60 transition-opacity duration-150',
  'text-muted-foreground dark:text-gray-400',
  'group-hover:opacity-100 group-focus:opacity-100'
])

export const menuLabelVariants = cva(
  'relative flex items-center px-3 py-2 text-xs font-semibold text-muted-foreground',
  {
    variants: {
      inset: {
        true: 'pl-8',
        false: ''
      }
    },
    defaultVariants: {
      inset: false
    }
  }
)

export const menuShortcutVariants = cva('ml-auto text-xs tracking-widest text-muted-foreground')

export type ZardMenuItemTypeVariants = NonNullable<VariantProps<typeof menuItemVariants>['zType']>
