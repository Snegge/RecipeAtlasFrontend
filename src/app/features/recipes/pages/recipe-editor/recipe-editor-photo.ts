import { SessionState } from '../../../../core/services/session-state';
import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { RecipeApiService } from '../../../../core/services/recipe-api.service';
import {
  ImportedIngredient,
  RecipeImportResult,
} from '../../../../core/models/recipe-import.model';
import { errorMessage } from '../../../../core/utils/api-error';
import { preparePhoto } from '../../../../core/utils/photo';
import { prepareImportedPhoto } from '../../../../core/utils/import-photo';

// Owns blobs/object URLs and retryable image changes; never saves recipe text.
@Injectable()
export class RecipeEditorPhoto {
  private readonly session = inject(SessionState);
  private readonly api = inject(RecipeApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly preparingPhoto = signal(false);
  readonly photoError = signal('');
  readonly preview = signal<string | null>(null);
  readonly externalPhotoUrl = signal<string | null>(null);
  private pendingPhoto: Blob | null = null;
  private photoRemoved = false;
  private originalPhoto: string | null = null;
  private objectUrl: string | null = null;
  constructor() {
    this.destroyRef.onDestroy(() => this.releasePreview());
  }
  load(url: string | null, version?: string): void {
    this.originalPhoto = url;
    this.preview.set(
      url && version
        ? url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(version)
        : url,
    );
  }
  async importPhoto(url: string): Promise<void> {
    const epoch = this.session.epoch();
    this.preparingPhoto.set(true);
    this.photoError.set('');

    try {
      const blob = await prepareImportedPhoto(url);

      if (this.destroyRef.destroyed || epoch !== this.session.epoch()) return;

      this.setPendingPhoto(blob);
      this.externalPhotoUrl.set(null);
    } catch {
      if (!this.destroyRef.destroyed && epoch === this.session.epoch()) {
        this.photoError.set(
          'The recipe was imported, but its photo could not be copied. ' +
            'Open the website photo below, save it, and upload it here.',
        );
      }
    } finally {
      if (!this.destroyRef.destroyed && epoch === this.session.epoch()) {
        this.preparingPhoto.set(false);
      }
    }
  }

  async choosePhoto(event: Event, busy = false): Promise<void> {
    const epoch = this.session.epoch();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file || busy || this.preparingPhoto()) return;

    this.preparingPhoto.set(true);
    this.photoError.set('');

    try {
      const blob = await preparePhoto(file);

      if (this.destroyRef.destroyed || epoch !== this.session.epoch()) return;

      this.setPendingPhoto(blob);
      this.externalPhotoUrl.set(null);
    } catch (error) {
      if (!this.destroyRef.destroyed && epoch === this.session.epoch()) {
        this.photoError.set(errorMessage(error));
      }
    } finally {
      if (!this.destroyRef.destroyed && epoch === this.session.epoch()) {
        this.preparingPhoto.set(false);
      }
    }
  }

  private setPendingPhoto(blob: Blob): void {
    this.releasePreview();
    this.pendingPhoto = blob;
    this.photoRemoved = false;
    this.objectUrl = URL.createObjectURL(blob);
    this.preview.set(this.objectUrl);
  }

  removePhoto(): void {
    if (this.preparingPhoto()) return;

    this.releasePreview();
    this.pendingPhoto = null;
    this.photoRemoved = !!this.originalPhoto;
    this.preview.set(null);
    this.externalPhotoUrl.set(null);
    this.photoError.set('');
  }

  private releasePreview(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  hasUnsavedChanges(): boolean {
    return this.pendingPhoto !== null || this.photoRemoved;
  }
  pendingDescription(): string {
    return this.pendingPhoto
      ? 'Pending picture replacement'
      : this.photoRemoved
        ? 'Pending picture removal'
        : 'No pending picture change';
  }
  rebase(url: string | null, version: string): void {
    this.originalPhoto = url;
    if (!this.hasUnsavedChanges()) this.load(url, version);
  }
  async persist(cookbookId: string, id: string, expectedVersion: string) {
    if (this.pendingPhoto)
      return await this.api.upload(cookbookId, id, this.pendingPhoto, expectedVersion);
    if (this.photoRemoved) return await this.api.removeImage(cookbookId, id, expectedVersion);
    return null;
  }
  clear(): void {
    this.releasePreview();
    this.pendingPhoto = null;
    this.photoRemoved = false;
    this.originalPhoto = null;
    this.preview.set(null);
    this.externalPhotoUrl.set(null);
    this.photoError.set('');
    this.preparingPhoto.set(false);
  }
  committed(): void {
    this.pendingPhoto = null;
    this.photoRemoved = false;
  }
}
