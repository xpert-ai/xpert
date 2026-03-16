import { cva, type VariantProps } from 'class-variance-authority';

export const progressCircleVariants = cva('inline-block', {
  variants: {
    zType: {
      default: 'text-primary',
      destructive: 'text-destructive',
      accent: 'text-chart-1',
    },
  },
  defaultVariants: {
    zType: 'default',
  },
});

export type ZardProgressCircleVariants = VariantProps<typeof progressCircleVariants>;
export type ZardProgressCircleTypeVariants = NonNullable<ZardProgressCircleVariants['zType']>;
