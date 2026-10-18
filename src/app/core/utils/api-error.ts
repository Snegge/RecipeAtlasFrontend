import { HttpErrorResponse } from '@angular/common/http';

export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse))
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  if (error.status === 0 || error.status === 502 || error.status === 504)
    return 'Cannot reach your recipe book. Check your connection and try again.';
  if (error.status === 401) return 'Your session has ended. Sign in again to continue.';
  if (error.status === 404) return 'This resource is unavailable or you no longer have access.';
  if (error.status === 429) return 'Too many attempts. Please wait and try again.';
  if (error.status === 413) return 'This photo is too large. Choose a smaller image.';
  const errors = error.error?.errors;
  if (errors && typeof errors === 'object') return Object.values(errors).flat().join(' ');
  return error.status >= 500
    ? 'Your changes could not be saved. Please try again.'
    : (error.error?.title ?? 'The request could not be completed.');
}
