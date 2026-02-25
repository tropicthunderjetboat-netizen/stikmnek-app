import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as Vanuatu Vatu (VT) currency.
 * e.g. formatVT(5500) => "VT 5,500"
 * e.g. formatVT(45000) => "VT 45,000"
 */
export function formatVT(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'VT 0';
  return `VT ${Math.round(num).toLocaleString('en-US')}`;
}
