import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RecipesModule } from '../../recipes.module';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import { RecipeListComponent } from './recipe-list.component';

describe('Recipe list loading', () => {
  it('settles after a response without refetching due to incidental service signal reads', async () => {
    const incidental = signal(0);
    const list = vi.fn(() => {
      incidental();
      return of({ items: [], total: 0, page: 1, pageSize: 12 });
    });
    await TestBed.configureTestingModule({
      imports: [RecipesModule],
      providers: [provideRouter([]), { provide: RecipeApiService, useValue: { list } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(RecipeListComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
    incidental.set(1);
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Your next favorite starts here');
  });
});
