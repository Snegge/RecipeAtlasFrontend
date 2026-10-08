import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { RecipeApiService } from './core/services/recipe-api.service';

describe('NgModule application routes', () => {
  it('renders the lazy recipe list, editor, and login features in the application shell', async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: AuthService,
          useValue: { signedIn: signal(true), check: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: RecipeApiService,
          useValue: {
            list: vi.fn(() => of({ items: [], total: 0, page: 1, pageSize: 12 })),
            units: vi.fn().mockResolvedValue([{ code: 'g', label: 'gram' }]),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/recipes');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Your recipes');
    await router.navigateByUrl('/recipes/new');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-ingredient-editor')).not.toBeNull();
    await router.navigateByUrl('/login');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
  });
});
