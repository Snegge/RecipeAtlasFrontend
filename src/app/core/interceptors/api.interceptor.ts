import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { tap, finalize, catchError, takeUntil, throwError } from 'rxjs';
import { SessionState } from '../services/session-state';
import { PwaService } from '../services/pwa.service';
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const pwa = inject(PwaService);
  const writing = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (writing) pwa.writes.update((n) => n + 1);
  const session = inject(SessionState),
    epoch = session.epoch();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    request = request.clone({ setHeaders: { 'X-RecipeAtlas': '1' } });
  return next(request).pipe(
    takeUntil(session.changes),
    tap((event) => {
      if (event instanceof HttpResponse) pwa.connectionFailed.set(false);
    }),
    finalize(() => {
      if (writing) pwa.writes.update((n) => n - 1);
    }),
    catchError((error) => {
      if (error instanceof HttpErrorResponse && [0, 502, 503, 504].includes(error.status))
        pwa.connectionFailed.set(true);
      if (error instanceof HttpErrorResponse && error.status === 401)
        queueMicrotask(() => {
          if (session.epoch() === epoch) session.clear('expired');
        });
      return throwError(() => error);
    }),
  );
};
