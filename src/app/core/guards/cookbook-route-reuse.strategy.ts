import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

// Cookbook/recipe changes must recreate scoped state and run canDeactivate on an editor.
// Query-only changes retain the page (for example, read-only navigation messages).
@Injectable()
export class CookbookRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    current: ActivatedRouteSnapshot,
  ): boolean {
    return (
      super.shouldReuseRoute(future, current) &&
      ['cookbookId', 'id'].every((key) => future.paramMap.get(key) === current.paramMap.get(key))
    );
  }
}
