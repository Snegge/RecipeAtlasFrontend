import { Component, DestroyRef, ViewChild, HostListener, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, FormGroupDirective, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../core/services/cookbook.service';
import { SessionState } from '../../core/services/session-state';
import { CookbookMemberInput, MemberResponse } from '../../core/models/account.model';
import { PictureSelection } from '../../shared/forms/picture-selection';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-cookbook-editor',
  standalone: false,
  templateUrl: './cookbook-editor.component.html',
  styleUrl: './cookbooks.scss',
  providers: [PictureSelection],
})
export class CookbookEditorComponent {
  @ViewChild('memberForm') memberDirective?: FormGroupDirective;
  private resetMember() {
    this.member.reset({ username: '', role: 'Viewer' });
    this.memberDirective?.resetForm({ username: '', role: 'Viewer' });
  }
  readonly books = inject(CookbookService);
  readonly picture = inject(PictureSelection);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly isNew = Boolean(this.route.snapshot.data?.['create']);
  readonly savedId = signal<string | null>(
    this.isNew ? null : this.route.snapshot.paramMap.get('cookbookId'),
  );
  readonly members = signal<MemberResponse[]>([]);
  readonly pendingMembers = signal<CookbookMemberInput[]>([]);
  readonly loading = signal(!this.isNew);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
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
      this.form.reset();
      this.member.reset();
      this.members.set([]);
      this.pendingMembers.set([]);
      this.savedId.set(null);
      this.error.set('Your session changed. Return to your cookbooks.');
    });
    if (!this.isNew) void this.load();
  }
  private current(epoch: number) {
    return epoch === this.session.epoch() && !this.destroy.destroyed;
  }
  async load() {
    const id = this.savedId();
    if (!id) return;
    const epoch = this.session.epoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const book = await this.books.select(id);
      if (!this.current(epoch)) return;
      this.form.reset({ name: book.name, description: book.description ?? '' });
      this.picture.load(book.imageUrl);
      await this.loadMembers();
    } catch (e) {
      if (this.current(epoch)) this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
  async loadMembers() {
    const id = this.savedId();
    if (!id) return;
    const epoch = this.session.epoch();
    const members = await this.books.members(id);
    if (this.current(epoch)) this.members.set(members);
  }
  async save() {
    if (this.form.invalid || this.navigationBlocked()) {
      this.form.markAllAsTouched();
      return;
    }
    const epoch = this.session.epoch();
    const wasDirty = this.form.dirty;
    let successful = false;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    let detailsSaved = false;
    this.form.disable();
    this.member.disable();
    try {
      const value = this.form.getRawValue();
      let id = this.savedId();
      if (id) await this.books.rename(id, value.name, value.description || null);
      else {
        const book = await this.books.create(
          value.name,
          value.description || null,
          this.pendingMembers(),
        );
        if (!this.current(epoch)) return;
        id = book.id;
        this.savedId.set(id);
        this.pendingMembers.set([]);
      }
      if (!this.current(epoch)) return;
      detailsSaved = true;
      if (this.picture.changed()) {
        if (this.picture.blob) await this.books.upload(id, this.picture.blob);
        else await this.books.removeImage(id);
      }
      if (!this.current(epoch)) return;
      const book = await this.books.select(id);
      if (!this.current(epoch)) return;
      this.form.markAsPristine();
      this.picture.load(book.imageUrl);
      this.resetMember();
      this.notice.set('Cookbook saved.');
      successful = true;
      this.busy.set(false);
      if (this.isNew) await this.router.navigate(['/cookbooks', id, 'recipes']);
      else await this.loadMembers();
    } catch (e) {
      if (this.current(epoch))
        this.error.set(
          detailsSaved
            ? 'Cookbook details were saved, but the picture could not be saved. Retry uses the same cookbook. ' +
                errorMessage(e)
            : errorMessage(e),
        );
    } finally {
      this.busy.set(false);
      if (!this.destroy.destroyed) {
        this.form.enable();
        this.member.enable();
        if (!successful && wasDirty && this.current(epoch)) this.form.markAsDirty();
      }
    }
  }
  async add() {
    if (this.member.invalid || this.busy()) {
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
    await this.act(async () => {
      await this.books.add(id, input.username, input.role);
      this.resetMember();
    }, 'Invitation sent. They will join after accepting.');
  }
  removePending(index: number) {
    this.pendingMembers.update((items) => items.filter((_, i) => i !== index));
  }
  async role(member: MemberResponse, role: string) {
    const id = this.savedId();
    if (id) await this.act(() => this.books.role(id, member.userId, role), 'Member role updated.');
  }
  async remove(member: MemberResponse) {
    const id = this.savedId();
    if (id)
      await this.act(
        () =>
          member.isPending
            ? this.books.cancelInvitation(id, member.userId)
            : this.books.remove(id, member.userId),
        member.isPending ? 'Invitation cancelled.' : 'Member removed.',
      );
  }
  private async act(action: () => Promise<unknown>, notice: string) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      if (!this.current(epoch)) return;
      this.notice.set(notice);
      await this.loadMembers();
    } catch (e) {
      if (this.current(epoch)) this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
  hasUnsavedChanges() {
    return (
      this.form.dirty ||
      this.picture.changed() ||
      this.pendingMembers().length > 0 ||
      this.member.controls.username.value.trim().length > 0
    );
  }
  navigationBlocked() {
    return this.busy() || this.picture.preparing();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges() || this.navigationBlocked()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
