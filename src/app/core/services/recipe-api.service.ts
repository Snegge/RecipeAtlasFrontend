import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Recipe, RecipeInput, RecipePage, Unit } from '../models/recipe.model';
import { RecipeImportResult } from '../models/recipe-import.model';

@Injectable({ providedIn: 'root' })
export class RecipeApiService {
  private readonly http = inject(HttpClient);
  list(search: string, page: number) {
    return this.http.get<RecipePage>('/api/recipes', { params: { search, page, pageSize: 12 } });
  }
  get(id: string) {
    return firstValueFrom(this.http.get<Recipe>(`/api/recipes/${id}`));
  }
  units() {
    return firstValueFrom(this.http.get<Unit[]>('/api/units'));
  }
  create(input: RecipeInput) {
    return firstValueFrom(this.http.post<Recipe>('/api/recipes', input));
  }
  update(id: string, input: RecipeInput) {
    return firstValueFrom(this.http.put<Recipe>(`/api/recipes/${id}`, input));
  }
  delete(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/recipes/${id}`));
  }
  upload(id: string, image: Blob) {
    return firstValueFrom(
      this.http.put(`/api/recipes/${id}/image`, image, {
        headers: { 'Content-Type': image.type },
      }),
    );
  }
  removeImage(id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/recipes/${id}/image`));
  }

  //Remove
  importWebsite(url: string): Promise<RecipeImportResult> {
    return firstValueFrom(
      this.http.post<RecipeImportResult>('/api/recipes/import', { url }),
    );
  }
}
