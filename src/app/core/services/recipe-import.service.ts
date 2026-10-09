import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RecipeImportResult } from '../models/recipe-import.model';

@Injectable({ providedIn: 'root' })
export class RecipeImportService {
  private readonly http = inject(HttpClient);

  importLink(url: string) {
    return this.http.post<RecipeImportResult>(
      '/api/recipes/import',
      { url },
    );
  }
}