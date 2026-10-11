import { cva, type VariantProps } from 'class-variance-authority'

export const dialogVariants = cva('flex min-h-0 min-w-0 w-full max-h-full flex-col')
export type ZardDialogVariants = VariantProps<typeof dialogVariants>
