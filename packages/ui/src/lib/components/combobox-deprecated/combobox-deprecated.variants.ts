import { cva, type VariantProps } from 'class-variance-authority';

export const comboboxDeprecatedVariants = cva('', {
  variants: {
    zWidth: {
      default: 'w-50',
      sm: 'w-37.5',
      md: 'w-62.5',
      lg: 'w-87.5',
      full: 'w-full',
    },
  },
  defaultVariants: {
    zWidth: 'default',
  },
});

export type ZardComboboxDeprecatedWidthVariants = NonNullable<
  VariantProps<typeof comboboxDeprecatedVariants>['zWidth']
>;
