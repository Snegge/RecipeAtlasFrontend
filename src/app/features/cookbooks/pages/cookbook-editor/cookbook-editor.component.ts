import {
  Component,
  DestroyRef,
  ViewChild,
  HostListener,
  ElementRef,
  Type,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, FormGroupDirective, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CookbookService } from '../../../../core/services/cookbook.service';
import { SessionState } from '../../../../core/services/session-state';
import {
  CookbookMemberInput,
  CookbookMembersResponse,
  CookbookResponse,
  MemberResponse,
} from '../../../../core/models/account.model';
import { PictureSelection } from '../../../../shared/forms/picture-selection';
import { errorMessage } from '../../../../core/utils/api-error';
import { isConcurrencyConflict } from '../../../../core/utils/concurrency';
import {
  ConflictReviewComponent,
  ConflictSource,
} from '../../../../shared/components/conflict-review/conflict-review.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-cookbook-editor',
  standalone: false,
  templateUrl: './cookbook-editor.component.html',
  styleUrl: './cookbook-editor.component.scss',
  providers: [PictureSelection],
})
export class CookbookEditorComponent {
  @ViewChild('memberForm') memberDirective?: FormGroupDirective;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly books = inject(CookbookService);
  readonly picture = inject(PictureSelection);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly isNew = Boolean(this.route.snapshot.data?.['create']);
  readonly savedId = signal<string | null>(
    this.isNew ? null : this.route.snapshot.paramMap.get('cookbookId'),
  );
  readonly baseline = signal<CookbookResponse | null>(null);
  readonly latest = signal<CookbookMembersResponse | null>(null);
  readonly conflict = signal(false);
  readonly unavailable = signal(false);
  readonly partialSaved = signal(false);
  readonly members = signal<MemberResponse[]>([]);
  readonly pendingMembers = signal<CookbookMemberInput[]>([]);
  readonly loading = signal(!this.isNew);
  readonly busy = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal('');
  private readGeneration = 0;
  private readonly fb = inject(NonNullableFormBuilder);
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(2000)],
  });
  readonly member = this.fb.group({
    username: ['', [Validators.required, Validators.maxLength(32)]],
    role: ['Viewer', Validators.required],
  });
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      ++this.readGeneration;
      this.busy.set(false);
      this.refreshing.set(false);
      this.loading.set(false);
      this.form.enable();
      this.member.enable();
      this.snack.dismiss();
      this.form.reset();
      this.member.reset();
      this.members.set([]);
      this.pendingMembers.set([]);
      this.savedId.set(null);
      this.baseline.set(null);
      this.latest.set(null);
      this.conflict.set(false);
      this.unavailable.set(true);
      this.error.set('Your session changed. Return to your cookbooks.');
    });
    if (!this.isNew) void this.load();
  }
  private current(epoch: number) {
    return epoch === this.session.epoch() && !this.destroy.destroyed;
  }
  private resetMember() {
    this.member.reset({ username: '', role: 'Viewer' });
    this.memberDirective?.resetForm({ username: '', role: 'Viewer' });
  }
  private display(state: CookbookMembersResponse) {
    this.baseline.set(state.cookbook);
    this.books.context.current.set(state.cookbook);
    this.members.set(state.members);
    this.form.reset({ name: state.cookbook.name, description: state.cookbook.description ?? '' });
    this.picture.load(state.cookbook.imageUrl);
  }
  async load() {
    const id = this.savedId();
    if (!id) return;
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const state = await this.books.members(id);
      if (this.current(epoch)) this.display(state);
    } catch (e) {
      if (this.current(epoch)) this.failure(e);
    } finally {
      if (this.current(epoch)) this.loading.set(false);
    }
  }
  metadataDirty() {
    return this.form.dirty || this.picture.changed();
  }
  membershipBlocked() {
    return (
      this.navigationBlocked() ||
      this.unavailable() ||
      this.conflict() ||
      (!!this.savedId() && this.metadataDirty())
    );
  }
  async loadMembers() {
    // A coherent refresh may replace pristine metadata only. Dirty forms retain their own baseline.
    if (this.metadataDirty() || this.conflict() || this.unavailable()) return;
    const id = this.savedId();
    if (!id) return;
    const epoch = this.session.epoch();
    const state = await this.books.members(id);
    if (this.current(epoch) && !this.metadataDirty() && !this.conflict()) this.display(state);
  }
  private failure(e: unknown) {
    if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status)) {
      this.unavailable.set(true);
      this.error.set(
        'Cookbook settings are no longer available with your current access. Your local fields remain here; copy them before leaving.',
      );
    } else this.error.set(errorMessage(e));
  }
  async save() {
    if (this.form.invalid || this.navigationBlocked() || this.conflict() || this.unavailable()) {
      this.form.markAllAsTouched();
      return;
    }
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    this.form.disable();
    this.member.disable();
    let detailsSaved = this.partialSaved();
    try {
      const value = this.form.getRawValue();
      let book = this.baseline();
      if (!this.savedId()) {
        book = await this.books.create(
          value.name,
          value.description || null,
          this.pendingMembers(),
        );
        if (!this.current(epoch)) return;
        this.savedId.set(book.id);
        this.pendingMembers.set([]);
      } else if (!this.partialSaved() || this.form.dirty) {
        book = await this.books.rename(
          this.savedId()!,
          value.name,
          value.description || null,
          book!.version,
        );
        if (!this.current(epoch)) return;
      }
      if (!book) return;
      this.baseline.set(book);
      this.books.context.current.set(book);
      detailsSaved = true;
      this.form.markAsPristine();
      this.partialSaved.set(this.picture.changed());
      if (this.picture.changed()) {
        book = this.picture.blob
          ? await this.books.upload(book.id, this.picture.blob, book.version)
          : await this.books.removeImage(book.id, book.version);
        if (!this.current(epoch)) return;
        this.baseline.set(book);
        this.books.context.current.set(book);
        this.picture.load(book.imageUrl);
      }
      this.partialSaved.set(false);
      this.resetMember();
      // Fetch members and metadata together, never pair old form content with a newer token.
      const state = await this.books.members(book.id);
      if (!this.current(epoch)) return;
      this.display(state);
      this.snack.open('Cookbook saved.', 'Close', { duration: 4000 });
      this.busy.set(false);
      if (this.isNew) await this.router.navigate(['/cookbooks', book.id, 'recipes']);
    } catch (e) {
      if (!this.current(epoch)) return;
      if (isConcurrencyConflict(e)) {
        this.conflict.set(true);
        this.error.set(
          detailsSaved && this.partialSaved()
            ? 'Cookbook details were saved. The picture remains pending. Review the current cookbook.'
            : 'This cookbook changed. Your local fields and picture are still here. Review before saving.',
        );
        await this.refreshConflict();
      } else {
        this.failure(e);
        if (detailsSaved && this.partialSaved() && !this.unavailable())
          this.error.set(
            'Cookbook details were saved; the picture remains pending. Save again to retry only the picture. ' +
              errorMessage(e),
          );
      }
    } finally {
      if (this.current(epoch)) {
        this.busy.set(false);
        this.form.enable();
        this.member.enable();
      }
    }
  }
  async add() {
    if (this.member.invalid || this.membershipBlocked()) {
      this.member.markAllAsTouched();
      return;
    }
    const input = this.member.getRawValue();
    input.username = input.username.trim();
    const id = this.savedId();
    if (!id) {
      if (
        this.pendingMembers().some((m) => m.username.toUpperCase() === input.username.toUpperCase())
      ) {
        this.error.set('This person is already in the invitation list.');
        return;
      }
      this.pendingMembers.update((items) => [...items, input]);
      this.resetMember();
      return;
    }
    const version = this.baseline()!.version;
    await this.act(
      () => this.books.add(id, input.username, input.role, version),
      'Invitation sent. They will join after accepting.',
      true,
    );
  }
  removePending(index: number) {
    if (!this.busy()) this.pendingMembers.update((items) => items.filter((_, i) => i !== index));
  }
  async role(member: MemberResponse, role: string) {
    const book = this.baseline();
    if (book)
      await this.act(
        () => this.books.role(book.id, member.userId, role, book.version),
        'Member role updated.',
      );
  }
  async remove(member: MemberResponse) {
    const book = this.baseline();
    if (book)
      await this.act(
        () =>
          member.isPending
            ? this.books.cancelInvitation(book.id, member.userId, book.version)
            : this.books.remove(book.id, member.userId, book.version),
        member.isPending ? 'Invitation cancelled.' : 'Member removed.',
      );
  }
  private async act(action: () => Promise<unknown>, message: string, reset = false) {
    if (this.membershipBlocked()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    this.form.disable();
    this.member.disable();
    try {
      await action();
      if (!this.current(epoch)) return;
      const state = await this.books.members(this.savedId()!);
      if (!this.current(epoch)) return;
      this.display(state);
      if (reset) this.resetMember();
      this.snack.open(message, 'Close', { duration: 4000 });
    } catch (e) {
      if (!this.current(epoch)) return;
      if (isConcurrencyConflict(e)) {
        // Refresh is display-only. The rejected action is never replayed.
        try {
          const state = await this.books.members(this.savedId()!);
          if (!this.current(epoch)) return;
          this.display(state);
          this.error.set(
            'Membership or cookbook details changed. Review the refreshed state, then choose the action again.',
          );
        } catch (readError) {
          if (this.current(epoch)) {
            this.conflict.set(true);
            this.failure(readError);
          }
        }
      } else this.failure(e);
    } finally {
      if (this.current(epoch)) {
        this.busy.set(false);
        this.form.enable();
        this.member.enable();
      }
    }
  }
  async refreshConflict() {
    const id = this.savedId();
    if (!id || !this.conflict() || this.refreshing() || this.unavailable()) return;
    const epoch = this.session.epoch(),
      generation = ++this.readGeneration;
    this.refreshing.set(true);
    this.latest.set(null);
    try {
      const state = await this.books.members(id);
      if (this.current(epoch) && generation === this.readGeneration) this.latest.set(state);
    } catch (e) {
      if (this.current(epoch) && generation === this.readGeneration) this.failure(e);
    } finally {
      if (this.current(epoch) && generation === this.readGeneration) this.refreshing.set(false);
    }
  }
  private async decision<T>(component: Type<unknown>, data: unknown): Promise<T | undefined> {
    const ref = this.dialog.open(component, {
      data,
      width: 'calc(100% - 24px)',
      maxWidth: '900px',
      maxHeight: '95dvh',
      autoFocus: 'dialog',
      restoreFocus: true,
    });
    const close = this.session.changes.subscribe(() => ref.close());
    const stop = this.destroy.onDestroy(() => ref.close());
    try {
      return await firstValueFrom(ref.afterClosed());
    } finally {
      close.unsubscribe();
      stop();
    }
  }
  async discardMetadata() {
    const book = this.baseline(),
      epoch = this.session.epoch();
    if (!book || this.navigationBlocked() || this.conflict()) return;
    const accepted = await this.decision<boolean>(ConfirmDialogComponent, {
      title: 'Discard detail changes?',
      message: 'Discard unsaved cookbook fields and picture changes?',
      action: 'Discard changes',
    });
    if (!accepted || !this.current(epoch)) return;
    this.form.reset({ name: book.name, description: book.description ?? '' });
    this.picture.load(book.imageUrl);
  }
  async loadServer() {
    const state = this.latest(),
      epoch = this.session.epoch();
    if (!state || this.navigationBlocked() || this.unavailable()) return;
    const accepted = await this.decision<boolean>(ConfirmDialogComponent, {
      title: 'Discard local cookbook changes?',
      message: 'Discard your local fields and pending cover picture?',
      action: 'Load server version',
    });
    if (!accepted || !this.current(epoch) || this.latest() !== state) return;
    this.display(state);
    this.resolved();
  }
  async review() {
    const state = this.latest(),
      epoch = this.session.epoch();
    if (!state || this.navigationBlocked() || this.unavailable()) return;
    const local = this.form.getRawValue(),
      book = state.cookbook;
    const choices = await this.decision<Record<string, ConflictSource>>(ConflictReviewComponent, {
      title: 'Review cookbook changes',
      explanation:
        'Choose the values to keep. Applying leaves an unsaved draft. Membership changes are never replayed.',
      fields: [
        { id: 'name', label: 'Name', local: local.name, server: book.name },
        {
          id: 'description',
          label: 'Description',
          local: local.description,
          server: book.description ?? '',
        },
        {
          id: 'photo',
          label: 'Cover picture',
          local: this.picture.changed()
            ? this.picture.blob
              ? 'Pending replacement'
              : 'Pending removal'
            : 'No pending change',
          server: book.imageUrl ? 'Current server cover' : 'No server cover',
          localImage: this.picture.preview(),
          serverImage: book.imageUrl,
          canKeepLocal: this.picture.changed(),
        },
      ],
    });
    if (!choices || !this.current(epoch) || this.latest() !== state) return;
    this.baseline.set(book);
    this.books.context.current.set(book);
    this.members.set(state.members);
    this.form.reset({
      name: choices['name'] === 'server' ? book.name : local.name,
      description:
        choices['description'] === 'server' ? (book.description ?? '') : local.description,
    });
    if (choices['photo'] === 'server') this.picture.load(book.imageUrl);
    this.form.markAsDirty();
    this.resolved();
  }
  private resolved() {
    this.latest.set(null);
    this.conflict.set(false);
    this.partialSaved.set(false);
    this.error.set('');
    this.element.nativeElement
      .querySelector<HTMLInputElement>('input[formcontrolname="name"]')
      ?.focus();
  }
  hasUnsavedChanges() {
    return (
      this.conflict() ||
      this.form.dirty ||
      this.picture.changed() ||
      this.pendingMembers().length > 0 ||
      this.member.controls.username.value.trim().length > 0
    );
  }
  navigationBlocked() {
    return this.busy() || this.loading() || this.refreshing() || this.picture.preparing();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
