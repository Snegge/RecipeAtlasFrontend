import {
  Component,
  computed,
  HostListener,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SessionState } from '../../../../core/services/session-state';
import { ShoppingItemResponse } from '../../../../core/models/shopping.model';
import { ShoppingState } from '../../shopping-state';
import { ShoppingSettingsComponent } from '../shopping-settings/shopping-settings.component';
import { ShoppingEvents } from '../../shopping-events';
@Component({
  selector: 'app-shopping-detail',
  standalone: false,
  templateUrl: './shopping-detail.component.html',
  styleUrl: './shopping-detail.component.scss',
  providers: [ShoppingState, ShoppingEvents],
})
export class ShoppingDetailComponent {
  readonly state = inject(ShoppingState);
  selectedTab = 0;
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly events = inject(ShoppingEvents);
  private readonly snack = inject(MatSnackBar);
  @ViewChild(ShoppingSettingsComponent) settings?: ShoppingSettingsComponent;
  @ViewChild('quickInput') quickInput?: ElementRef<HTMLInputElement>;
  constructor() {
    const availableUndo = computed(() => {
      const undo = this.state.undo().at(-1);
      return undo && !this.state.blocked() && this.state.canRestore(undo.id) ? undo : undefined;
    });
    effect((onCleanup) => {
      const undo = availableUndo();
      if (!undo) return;
      const duration = undo.until - Date.now();
      if (duration <= 0) return;
      const ref = this.snack.open('Removed ' + undo.text, 'Undo', {
        duration,
        panelClass: 'shopping-undo-snackbar',
      });
      const action = ref.onAction().subscribe(() => void this.state.restore(undo.id));
      onCleanup(() => {
        action.unsubscribe();
        ref.dismiss();
      });
    });
    this.events.start(
      () => void this.state.refresh(),
      (id) => this.state.accessLost(id),
    );
    effect(() => {
      const list = this.state.list();
      this.events.watch(list ? [list.id] : []);
    });
    void this.state.open(inject(ActivatedRoute).snapshot.paramMap.get('listId')!);
  }
  async edit(item: ShoppingItemResponse) {
    const epoch = this.session.epoch();
    await this.state.beginEdit(item);
    setTimeout(() => {
      if (!this.destroy.destroyed && epoch === this.session.epoch() && !this.state.blocked())
        this.host.nativeElement
          .querySelector<HTMLInputElement>('[data-testid=item-draft]')
          ?.focus();
    });
  }
  saveOnEnter(event: Event) {
    event.preventDefault();
    void this.state.save();
  }
  async add() {
    await this.state.add();
  }
  purchase(item: ShoppingItemResponse) {
    const focused = document.activeElement;
    const restoreFocus = focused instanceof HTMLInputElement && focused.type === 'checkbox';
    void this.state.purchase(item);
    if (restoreFocus) this.quickInput?.nativeElement.focus();
  }
  remove(item: ShoppingItemResponse) {
    void this.state.remove(item);
    this.quickInput?.nativeElement.focus();
  }
  detachedDraft() {
    const draft = this.state.draft();
    return draft && !this.state.items().some((item) => item.id === draft.id);
  }
  async retry(key: string) {
    if (this.settings) await this.settings.retry(key);
    else await this.state.retry(key);
  }
  hasUnsavedChanges() {
    return this.state.hasUnsavedChanges() || !!this.settings?.hasUnsavedChanges();
  }
  navigationBlocked() {
    return this.state.navigationBlocked();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
