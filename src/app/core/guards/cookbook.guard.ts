import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { CookbookService } from '../services/cookbook.service';
export const cookbookGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService),
    books = inject(CookbookService),
    router = inject(Router);
  if (!(await auth.check()))
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  const id = route.paramMap.get('cookbookId') ?? route.parent?.paramMap.get('cookbookId');
  if (!id) return router.createUrlTree(['/cookbooks']);
  try {
    const book = await books.select(id);
    if (route.data['manage'] && book.role !== 'Owner')
      return router.createUrlTree(['/cookbooks', id, 'recipes'], {
        queryParams: { message: 'Only the owner can manage this cookbook.' },
      });
    if (route.data['write'] && book.role === 'Viewer')
      return router.createUrlTree(['/cookbooks', id, 'recipes'], {
        queryParams: { message: 'This cookbook is read-only.' },
      });
    return true;
  } catch (error) {
    if (error instanceof HttpErrorResponse && error.status === 401)
      return router.createUrlTree(['/login']);
    books.context.current.set(null);
    return router.createUrlTree(['/cookbooks'], {
      queryParams: { message: 'This cookbook is no longer accessible. Choose another cookbook.' },
    });
  }
};
export const administratorGuard: CanActivateFn = async () => {
  const auth = inject(AuthService),
    router = inject(Router);
  return (await auth.check()) && auth.user()?.isAdministrator
    ? true
    : router.createUrlTree(['/cookbooks'], {
        queryParams: { message: 'Administrator access is required.' },
      });
};
