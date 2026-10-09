import { Injectable } from '@angular/core';
import { RecipeImportResult } from '../models/recipe-import.model';

@Injectable({ providedIn: 'root' })
export class RecipeDraftService {
  private pending: {
    id: string;
    result: RecipeImportResult;
  } | null = null;

  put(result: RecipeImportResult): string {
    const id = crypto.randomUUID();

    this.pending = { id, result };

    return id;
  }

  get(id: string): RecipeImportResult | null {
    return this.pending?.id === id
      ? this.pending.result
      : null;
  }

  remove(id: string): void {
    if (this.pending?.id === id) {
      this.pending = null;
    }
  }
}