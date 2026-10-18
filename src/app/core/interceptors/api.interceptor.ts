import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, takeUntil, throwError } from 'rxjs';
import { SessionState } from '../services/session-state';
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const session = inject(SessionState),
    epoch = session.epoch();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    request = request.clone({ setHeaders: { 'X-RecipeAtlas': '1' } });
  return next(request).pipe(
    takeUntil(session.changes),
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401)
        queueMicrotask(() => {
          if (session.epoch() === epoch) session.clear('expired');
        });
      return throwError(() => error);
    }),
  );
};
