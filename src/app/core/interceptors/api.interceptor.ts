import { HttpInterceptorFn } from '@angular/common/http';

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    request = request.clone({ setHeaders: { 'X-RecipeAtlas': '1' } });
  return next(request);
};
