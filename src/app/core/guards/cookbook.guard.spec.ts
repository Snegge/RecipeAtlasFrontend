import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { CookbookService } from '../services/cookbook.service';
import { administratorGuard, cookbookGuard } from './cookbook.guard';

describe('Cookbook navigation guards', () => {
  const check = vi.fn(),
    select = vi.fn();
  const user = signal({ isAdministrator: false, email: null, avatarUrl: null });
  const current = signal<unknown>(null);
  beforeEach(() => {
    check.mockReset().mockResolvedValue(true);
    select.mockReset().mockResolvedValue({ id: 'book', role: 'Viewer' });
    user.set({ isAdministrator: false, email: null, avatarUrl: null });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { check, user } },
        { provide: CookbookService, useValue: { select, context: { current } } },
      ],
    });
  });
  async function run(data = {}) {
    const route = {
      paramMap: convertToParamMap({ cookbookId: 'book' }),
      data,
    } as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() =>
      cookbookGuard(route, { url: '/cookbooks/book/recipes' } as RouterStateSnapshot),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }
  it('keeps a viewer on read-only recipe routes', async () => {
    expect(await run()).toBe(true);
    expect(await run({ write: true })).toContain('/cookbooks/book/recipes?message=');
    expect(await run({ manage: true })).toContain('/cookbooks/book/recipes?message=');
  });
  it('permits an editor to write but reserves settings for the owner', async () => {
    select.mockResolvedValue({ id: 'book', role: 'Editor' });
    expect(await run({ write: true })).toBe(true);
    expect(await run({ manage: true })).toContain('Only%20the%20owner');
    select.mockResolvedValue({ id: 'book', role: 'Owner' });
    expect(await run({ manage: true })).toBe(true);
  });
  it('redirects 401 to login and 403/404 to an accessible overview', async () => {
    for (const status of [401, 403, 404]) {
      select.mockRejectedValueOnce(new HttpErrorResponse({ status }));
      const result = await run();
      expect(result).toContain(status === 401 ? '/login' : '/cookbooks?message=');
    }
    check.mockResolvedValue(false);
    expect(await run()).toContain('/login?returnUrl=');
  });
  it('requires global administration independently of cookbook role', async () => {
    const route = {} as ActivatedRouteSnapshot,
      state = {} as RouterStateSnapshot;
    expect(
      await TestBed.runInInjectionContext(() => administratorGuard(route, state)),
    ).toBeInstanceOf(UrlTree);
    user.set({ isAdministrator: true, email: null, avatarUrl: null });
    expect(await TestBed.runInInjectionContext(() => administratorGuard(route, state))).toBe(true);
  });
});
