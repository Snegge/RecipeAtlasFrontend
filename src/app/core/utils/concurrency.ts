import { HttpErrorResponse } from '@angular/common/http';

export function isConcurrencyConflict(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    [409, 412].includes(error.status) &&
    error.error?.code === 'concurrency_conflict'
  );
}

// Tokens are opaque. Only the transport layer quotes them for the single strong If-Match contract.
export function ifMatch(version: string): Record<string, string> {
  return { 'If-Match': `"${version}"` };
}
