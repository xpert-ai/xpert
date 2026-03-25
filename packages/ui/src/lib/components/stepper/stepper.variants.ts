import { cva } from 'class-variance-authority';

export const stepperVariants = cva(
  'z-stepper flex w-full min-w-0 flex-col gap-6 [--z-stepper-header-max-width:100%] [--z-stepper-item-max-width:15rem]',
  {
  variants: {
    orientation: {
      horizontal: '',
      vertical: '',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperHeaderVariants = cva('z-stepper__header flex min-w-0', {
  variants: {
    orientation: {
      horizontal: 'mx-auto w-full max-w-[var(--z-stepper-header-max-width)] items-start justify-center gap-6 pb-1',
      vertical: 'flex-col gap-4',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperItemVariants = cva('z-stepper__item min-w-0', {
  variants: {
    orientation: {
      horizontal: 'min-w-0 max-w-[var(--z-stepper-item-max-width)] flex-1 basis-0',
      vertical: 'w-full',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperTriggerVariants = cva(
  [
    'z-stepper__trigger group relative flex min-w-0 rounded-2xl',
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  ],
  {
    variants: {
      orientation: {
        horizontal: 'h-full w-full flex-col items-center gap-4 text-center',
        vertical: 'w-full items-stretch gap-4 text-left',
      },
      state: {
        upcoming: 'text-muted-foreground hover:text-foreground',
        active: 'text-foreground',
        completed: 'text-foreground',
      },
      blocked: {
        true: 'cursor-not-allowed opacity-60',
        false: 'cursor-pointer',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      state: 'upcoming',
      blocked: false,
    },
  },
);

export const stepperRailVariants = cva('z-stepper__rail flex shrink-0', {
  variants: {
    orientation: {
      horizontal: 'relative h-12 w-full items-center justify-center',
      vertical: 'flex-col items-center gap-3 self-stretch',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperIndicatorVariants = cva(
  [
    'z-stepper__indicator relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border text-sm',
    'font-semibold tabular-nums shadow-sm transition-colors',
  ],
  {
    variants: {
      state: {
        upcoming: 'border-border bg-background text-muted-foreground',
        active: 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/10',
        completed: 'border-border bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: {
      state: 'upcoming',
    },
  },
);

export const stepperConnectorVariants = cva('z-stepper__connector block rounded-full transition-colors', {
  variants: {
    orientation: {
      horizontal: 'absolute top-1/2 left-[calc(50%+1.5rem)] h-0.5 w-[calc(100%-1.5rem)] -translate-y-1/2',
      vertical: 'min-h-10 w-0.5 flex-1',
    },
    state: {
      upcoming: 'bg-border',
      active: 'bg-primary/60',
      completed: 'bg-secondary',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
    state: 'upcoming',
  },
});

export const stepperContentVariants = cva('z-stepper__content flex min-w-0 flex-col', {
  variants: {
    orientation: {
      horizontal: 'w-full items-center gap-2 px-2 text-center',
      vertical: 'flex-1 items-start justify-center gap-1 pt-1 text-left',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperPanelVariants = cva(
  'z-stepper__panel min-w-0 border-none bg-transparent p-4 shadow-none ring-0',
);
