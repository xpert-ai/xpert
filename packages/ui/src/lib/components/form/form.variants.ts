import { cva, type VariantProps } from 'class-variance-authority';

export const formFieldVariants = cva('grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2', {
  variants: {
    zAppearance: {
      fill: 'rounded-lg bg-muted/20 p-3',
      outline: 'rounded-lg border border-border p-3',
      standard: 'border-b border-border pb-2',
      legacy: 'border-b border-border pb-2',
    },
    zDisplayDensity: {
      comfortable: '',
      cosy: '',
      compact: 'gap-1.5',
    },
  },
  defaultVariants: {
    zAppearance: 'fill',
    zDisplayDensity: 'comfortable',
  },
});

export const formLabelVariants = cva(
  'col-[1/-1] text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      zRequired: {
        true: "after:content-['*'] after:ml-0.5 after:text-red-500",
      },
    },
  },
);

export const formControlVariants = cva('');

export const formMessageVariants = cva('col-[1/-1] text-sm', {
  variants: {
    zType: {
      default: 'text-muted-foreground',
      error: 'text-red-500',
      success: 'text-green-500',
      warning: 'text-yellow-500',
    },
  },
  defaultVariants: {
    zType: 'default',
  },
});

export type ZardFormMessageTypeVariants = NonNullable<VariantProps<typeof formMessageVariants>['zType']>;
export type ZardFormFieldAppearanceVariants = NonNullable<VariantProps<typeof formFieldVariants>['zAppearance']>;
export type ZardFormFieldDisplayDensityVariants = NonNullable<
  VariantProps<typeof formFieldVariants>['zDisplayDensity']
>;
