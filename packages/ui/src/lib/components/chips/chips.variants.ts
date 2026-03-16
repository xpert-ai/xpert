import { cva, type VariantProps } from 'class-variance-authority'

export const chipContainerVariants = cva('z-chip-container flex min-w-0 items-center gap-2', {
  variants: {
    orientation: {
      horizontal: 'flex-row flex-wrap',
      vertical: 'flex-col items-stretch'
    }
  },
  defaultVariants: {
    orientation: 'horizontal'
  }
})

export const chipVariants = cva(
  'z-chip group/chip inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border shadow-sm transition-[background-color,color,border-color,box-shadow] duration-150',
  {
    variants: {
      kind: {
        default: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
        row: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
        option: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
      },
      displayDensity: {
        default: 'min-h-8 px-3 py-1.5 text-sm',
        cosy: 'min-h-7 px-2.5 py-1 text-xs',
        compact: 'min-h-6 px-2 py-0.5 text-xs'
      },
      interactive: {
        true: 'cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:border-neutral-300 hover:bg-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-700',
        false: ''
      },
      selected: {
        true: 'border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700',
        false: 'border-transparent'
      },
      highlighted: {
        true: 'ring-1 ring-inset ring-neutral-300 dark:ring-neutral-600',
        false: ''
      },
      disabled: {
        true: 'pointer-events-none opacity-50',
        false: ''
      },
      color: {
        default: '',
        basic: '',
        primary: '',
        accent: '',
        warn: ''
      }
    },
    compoundVariants: [
      {
        color: 'primary',
        selected: true,
        class: 'border-primary/25 bg-primary/10 text-primary'
      },
      {
        color: 'primary',
        highlighted: true,
        class: 'border-primary/20 bg-primary/5 text-primary ring-primary/20'
      },
      {
        color: 'accent',
        selected: true,
        class: 'border-accent/25 bg-accent/10 text-accent'
      },
      {
        color: 'accent',
        highlighted: true,
        class: 'border-accent/20 bg-accent/5 text-accent ring-accent/20'
      },
      {
        color: 'warn',
        selected: true,
        class: 'border-destructive/25 bg-destructive/10 text-destructive'
      },
      {
        color: 'warn',
        highlighted: true,
        class: 'border-destructive/20 bg-destructive/5 text-destructive ring-destructive/20'
      },
      {
        color: 'basic',
        selected: true,
        class: 'border-border bg-secondary text-secondary-foreground'
      },
      {
        kind: 'option',
        interactive: true,
        selected: true,
        class: 'shadow-md'
      }
    ],
    defaultVariants: {
      kind: 'default',
      displayDensity: 'default',
      interactive: false,
      selected: false,
      highlighted: false,
      disabled: false,
      color: 'default'
    }
  }
)

export const chipContentVariants = cva('min-w-0 flex-1 overflow-hidden')

export const chipAvatarVariants = cva(
  'z-chip__avatar inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200 [&>img]:h-full [&>img]:w-full [&>img]:rounded-full [&>img]:object-cover'
)

export const chipRemoveVariants = cva(
  'z-chip__remove inline-flex shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
  {
    variants: {
      displayDensity: {
        default: 'h-4 w-4',
        cosy: 'h-4 w-4',
        compact: 'h-3.5 w-3.5'
      },
      disabled: {
        true: 'pointer-events-none opacity-50',
        false: ''
      }
    },
    defaultVariants: {
      displayDensity: 'default',
      disabled: false
    }
  }
)

export type ZardChipContainerVariants = VariantProps<typeof chipContainerVariants>
export type ZardChipVariants = VariantProps<typeof chipVariants>
export type ZardChipDisplayDensity = NonNullable<ZardChipVariants['displayDensity']>
export type ZardChipColor = NonNullable<ZardChipVariants['color']>
export type ZardChipKind = NonNullable<ZardChipVariants['kind']>
