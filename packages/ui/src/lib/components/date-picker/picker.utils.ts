import type { ZardDatePickerSizeVariants } from './date-picker.variants';

export const HEIGHT_BY_SIZE: Record<ZardDatePickerSizeVariants, string> = {
  xs: 'h-7',
  sm: 'h-8',
  default: 'h-9',
  lg: 'h-11',
};

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

export function startOfQuarter(date: Date): Date {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1, 12, 0, 0, 0);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 12, 0, 0, 0);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 12, 0, 0, 0);
}

export function endOfQuarter(year: number, quarterIndex: number): Date {
  return new Date(year, quarterIndex * 3 + 3, 0, 12, 0, 0, 0);
}

export function endOfYear(year: number): Date {
  return new Date(year, 11, 31, 12, 0, 0, 0);
}
