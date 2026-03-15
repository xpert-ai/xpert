import { cva } from 'class-variance-authority';

export const stepperVariants = cva('z-stepper flex w-full min-w-0 flex-col gap-4', {
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

export const stepperHeaderVariants = cva('z-stepper__header flex min-w-0 gap-2', {
  variants: {
    orientation: {
      horizontal: 'flex-wrap items-stretch',
      vertical: 'flex-col',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

export const stepperTriggerVariants = cva(
  [
    'z-stepper__trigger group relative flex min-w-0 items-start gap-3 rounded-2xl border px-4 py-3 text-left',
    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  ],
  {
    variants: {
      orientation: {
        horizontal: 'flex-1',
        vertical: 'w-full',
      },
      state: {
        upcoming: 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/25',
        active: 'border-primary/50 bg-primary/10 text-foreground shadow-sm',
        completed: 'border-emerald-500/40 bg-emerald-500/10 text-foreground hover:border-emerald-500/60',
      },
      blocked: {
        true: 'opacity-60',
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

export const stepperIndicatorVariants = cva(
  [
    'z-stepper__indicator flex size-10 shrink-0 items-center justify-center rounded-full border text-sm',
    'font-semibold tabular-nums transition-colors',
  ],
  {
    variants: {
      state: {
        upcoming: 'border-border bg-background text-muted-foreground',
        active: 'border-primary bg-primary text-primary-foreground shadow-sm',
        completed: 'border-emerald-500 bg-emerald-500 text-white',
      },
    },
    defaultVariants: {
      state: 'upcoming',
    },
  },
);

export const stepperPanelVariants = cva(
  'z-stepper__panel min-w-0 rounded-2xl border border-border/60 bg-background/50 p-4 shadow-sm',
);
