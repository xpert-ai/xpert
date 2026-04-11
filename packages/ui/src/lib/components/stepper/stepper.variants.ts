import { cva, type VariantProps } from 'class-variance-authority'

export const stepperVariants = cva('z-stepper flex w-full min-w-0 flex-col [--z-stepper-header-max-width:100%]', {
  variants: {
    orientation: {
      horizontal: '',
      vertical: ''
    },
    zSize: {
      default: 'gap-6 [--z-stepper-item-max-width:15rem]',
      sm: 'gap-3 [--z-stepper-item-max-width:6rem]'
    }
  },
  defaultVariants: {
    orientation: 'horizontal',
    zSize: 'default'
  }
})

export const stepperHeaderVariants = cva('z-stepper__header flex min-w-0', {
  variants: {
    orientation: {
      horizontal: 'mx-auto w-full max-w-[var(--z-stepper-header-max-width)] items-start justify-center',
      vertical: 'flex-col'
    },
    zSize: {
      default: 'gap-6 pb-1',
      sm: 'gap-3 pb-0.5'
    }
  },
  defaultVariants: {
    orientation: 'horizontal',
    zSize: 'default'
  }
})

export const stepperItemVariants = cva('z-stepper__item min-w-0', {
  variants: {
    orientation: {
      horizontal: 'min-w-0 max-w-[var(--z-stepper-item-max-width)] flex-1 basis-0',
      vertical: 'w-full'
    }
  },
  defaultVariants: {
    orientation: 'horizontal'
  }
})

export const stepperTriggerVariants = cva(
  [
    'z-stepper__trigger group relative flex min-w-0 rounded-2xl',
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
  ],
  {
    variants: {
      orientation: {
        horizontal: 'h-full w-full flex-col items-center gap-4 text-center',
        vertical: 'w-full items-stretch gap-4 text-left'
      },
      zSize: {
        default: '',
        sm: 'gap-2.5 rounded-xl'
      },
      state: {
        upcoming: 'text-muted-foreground hover:text-foreground',
        active: 'text-foreground',
        completed: 'text-foreground'
      },
      blocked: {
        true: 'cursor-not-allowed opacity-60',
        false: 'cursor-pointer'
      }
    },
    defaultVariants: {
      orientation: 'horizontal',
      zSize: 'default',
      state: 'upcoming',
      blocked: false
    }
  }
)

export const stepperRailVariants = cva('z-stepper__rail flex shrink-0', {
  variants: {
    orientation: {
      horizontal: 'relative w-full items-center justify-center',
      vertical: 'flex-col items-center self-stretch'
    },
    zSize: {
      default: 'h-12 gap-3',
      sm: 'h-9 gap-2'
    }
  },
  defaultVariants: {
    orientation: 'horizontal',
    zSize: 'default'
  }
})

export const stepperIndicatorVariants = cva(
  [
    'z-stepper__indicator relative z-10 flex shrink-0 items-center justify-center rounded-full border',
    'font-semibold tabular-nums shadow-sm transition-colors'
  ],
  {
    variants: {
      zSize: {
        default: 'size-12 text-sm',
        sm: 'size-9 text-xs'
      },
      state: {
        upcoming: 'border-border bg-background text-muted-foreground',
        active: 'border-primary bg-primary text-primary-foreground',
        completed: 'border-border bg-secondary text-secondary-foreground'
      }
    },
    compoundVariants: [
      {
        state: 'active',
        zSize: 'default',
        class: 'ring-4 ring-primary/10'
      },
      {
        state: 'active',
        zSize: 'sm',
        class: 'ring-2 ring-primary/10'
      }
    ],
    defaultVariants: {
      zSize: 'default',
      state: 'upcoming'
    }
  }
)

export const stepperConnectorVariants = cva('z-stepper__connector block rounded-full transition-colors', {
  variants: {
    orientation: {
      horizontal: 'absolute top-1/2 h-0.5 -translate-y-1/2',
      vertical: 'w-0.5 flex-1'
    },
    zSize: {
      default: '',
      sm: ''
    },
    state: {
      upcoming: 'bg-border',
      active: 'bg-primary/60',
      completed: 'bg-secondary'
    }
  },
  compoundVariants: [
    {
      orientation: 'horizontal',
      zSize: 'default',
      class: 'left-[calc(50%+1.5rem)] w-[calc(100%-1.5rem)]'
    },
    {
      orientation: 'horizontal',
      zSize: 'sm',
      class: 'left-[calc(50%+1.125rem)] w-[calc(100%-1.125rem)]'
    },
    {
      orientation: 'vertical',
      zSize: 'default',
      class: 'min-h-10'
    },
    {
      orientation: 'vertical',
      zSize: 'sm',
      class: 'min-h-7'
    }
  ],
  defaultVariants: {
    orientation: 'horizontal',
    zSize: 'default',
    state: 'upcoming'
  }
})

export const stepperContentVariants = cva('z-stepper__content flex min-w-0 flex-col', {
  variants: {
    orientation: {
      horizontal: 'w-full items-center text-center',
      vertical: 'flex-1 items-start justify-center text-left'
    },
    zSize: {
      default: 'gap-2 px-2 pt-0',
      sm: 'gap-1 px-1 pt-0'
    }
  },
  defaultVariants: {
    orientation: 'horizontal',
    zSize: 'default'
  }
})

export const stepperPanelVariants = cva('z-stepper__panel min-w-0 border-none bg-transparent shadow-none ring-0', {
  variants: {
    zSize: {
      default: 'p-4',
      sm: 'p-3'
    }
  },
  defaultVariants: {
    zSize: 'default'
  }
})

export const stepperMetaVariants = cva('font-semibold uppercase text-muted-foreground', {
  variants: {
    zSize: {
      default: 'text-[0.6875rem] tracking-[0.24em]',
      sm: 'text-[0.625rem] tracking-[0.18em]'
    }
  },
  defaultVariants: {
    zSize: 'default'
  }
})

export const stepperLabelVariants = cva('block min-w-0 font-semibold text-foreground', {
  variants: {
    zSize: {
      default: 'text-base leading-6',
      sm: 'text-sm leading-5'
    }
  },
  defaultVariants: {
    zSize: 'default'
  }
})

export const stepperErrorVariants = cva('block text-destructive', {
  variants: {
    zSize: {
      default: 'text-xs',
      sm: 'text-[0.6875rem]'
    }
  },
  defaultVariants: {
    zSize: 'default'
  }
})

export type ZardStepperSizeVariants = NonNullable<VariantProps<typeof stepperVariants>['zSize']>
