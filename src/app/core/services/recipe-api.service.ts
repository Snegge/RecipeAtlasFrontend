import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Recipe, RecipeInput, RecipePage, Unit } from '../models/recipe.model';
import { RecipeImportResult } from '../models/recipe-import.model';

@Injectable({ providedIn: 'root' })
export class RecipeApiService {
  private readonly http = inject(HttpClient);
  list(cookbookId: string, search: string, page: number) {
    return this.http.get<RecipePage>(`/api/cookbooks/${cookbookId}/recipes`, {
      params: { search, page, pageSize: 12 },
    });
  }
  get(cookbookId: string, id: string) {
    return firstValueFrom(this.http.get<Recipe>(`/api/cookbooks/${cookbookId}/recipes/${id}`));
  }
  units() {
    return firstValueFrom(this.http.get<Unit[]>('/api/units'));
  }
  create(cookbookId: string, input: RecipeInput) {
    return firstValueFrom(this.http.post<Recipe>(`/api/cookbooks/${cookbookId}/recipes`, input));
  }
  update(cookbookId: string, id: string, input: RecipeInput) {
    return firstValueFrom(
      this.http.put<Recipe>(`/api/cookbooks/${cookbookId}/recipes/${id}`, input),
    );
  }
  delete(cookbookId: string, id: string) {
    return firstValueFrom(this.http.delete<void>(`/api/cookbooks/${cookbookId}/recipes/${id}`));
  }
  upload(cookbookId: string, id: string, image: Blob) {
    return firstValueFrom(
      this.http.put(`/api/cookbooks/${cookbookId}/recipes/${id}/image`, image, {
        headers: { 'Content-Type': image.type },
      }),
    );
  }
  removeImage(cookbookId: string, id: string) {
    return firstValueFrom(
      this.http.delete<void>(`/api/cookbooks/${cookbookId}/recipes/${id}/image`),
    );
  }

  //Remove
  importWebsite(url: string): Promise<RecipeImportResult> {
    return firstValueFrom(this.http.post<RecipeImportResult>('/api/recipes/import', { url }));
  }
}
