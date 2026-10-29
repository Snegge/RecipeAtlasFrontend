import { AccountAdminService } from './core/services/account-admin.service';
import { MatDialog } from '@angular/material/dialog';
import { RecipeEditorComponent } from './features/recipes/pages/recipe-editor/recipe-editor.component';
import { By } from '@angular/platform-browser';
import { CookbookService } from './core/services/cookbook.service';
import { CookbookContext } from './core/services/cookbook-context';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { RecipeApiService } from './core/services/recipe-api.service';
import { ShoppingService } from './core/services/shopping.service';
import { ShoppingSettingsComponent } from './features/shopping/pages/shopping-settings/shopping-settings.component';

vi.mock('@microsoft/signalr', () => ({
  HttpTransportType: { LongPolling: 4 },
  LogLevel: { None: 6 },
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      return {
        state: 'Connected',
        on: () => {},
        onreconnected: () => {},
        start: async () => {},
        stop: async () => {},
        invoke: async () => {},
      };
    }
  },
}));

describe('NgModule application routes', () => {
  it('renders the lazy recipe list, editor, and login features in the application shell', async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: ShoppingService,
          useValue: {
            get: async () => ({
              id: 'shopping-1',
              name: 'Weekly shop',
              role: 'Owner',
              version: 'v1',
              items: [],
              members: [],
              invitations: [],
            }),
          },
        },
        {
          provide: CookbookService,
          useValue: {
            select: vi.fn().mockResolvedValue({
              id: 'cookbook-1',
              name: 'Test',
              role: 'Owner',
              description: null,
              imageUrl: null,
              version: 'displayed-v1',
              recipeCount: 0,
            }),
            invitations: async () => [],
            list: () => of([{ id: 'cookbook-1', name: 'Test', role: 'Owner' }]),
          },
        },
        {
          provide: AccountAdminService,
          useValue: { accounts: async () => [], invitations: async () => [] },
        },
        {
          provide: AuthService,
          useValue: {
            signedIn: signal(true),
            user: signal({
              id: 'user-1',
              username: 'test',
              displayName: 'Test',
              isAdministrator: false,
              email: null,
              avatarUrl: null,
            }),
            check: vi.fn().mockResolvedValue(true),
          },
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
    TestBed.inject(CookbookContext).current.set({
      description: null,
      imageUrl: null,
      version: 'displayed-v1',
      recipeCount: 0,
      id: 'cookbook-1',
      name: 'Test',
      role: 'Owner',
    });
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/cookbooks/cookbook-1/recipes');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.brand').textContent).toContain('Recipoke');
    expect(fixture.nativeElement.querySelector('.brand').getAttribute('aria-label')).toBe(
      'Recipoke home',
    );
    expect(document.title).toBe('Your recipes · Recipoke');
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Your recipes');
    expect(fixture.nativeElement.querySelector('a[href="/admin"]')).toBeNull();
    TestBed.inject(AuthService).user.set({
      id: 'admin',
      username: 'administrator',
      displayName: 'Administrator',
      isAdministrator: true,
      email: null,
      avatarUrl: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin"]')).not.toBeNull();

    await router.navigateByUrl('/cookbooks/cookbook-1/recipes/new');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-ingredient-editor')).not.toBeNull();
    const editor = fixture.debugElement.query(By.directive(RecipeEditorComponent))
      .componentInstance as RecipeEditorComponent;
    editor.form.controls.title.setValue('Unsaved in first cookbook');
    editor.form.markAsDirty();
    const confirm = vi
      .spyOn(MatDialog.prototype, 'open')
      .mockReturnValue({ afterClosed: () => of(false) } as never);
    expect(await router.navigateByUrl('/cookbooks/cookbook-2/recipes/new')).toBe(false);
    expect(editor.form.controls.title.value).toBe('Unsaved in first cookbook');
    const warn = vi.spyOn((fixture.componentInstance as any).snack, 'open');
    fixture.componentInstance.reloadForUpdate();
    expect(warn).toHaveBeenCalled();
    expect(editor.form.controls.title.value).toBe('Unsaved in first cookbook');
    expect(confirm).toHaveBeenCalled();
    editor.form.markAsPristine();
    expect(await router.navigateByUrl('/cookbooks/cookbook-2/recipes/new')).toBe(true);
    await fixture.whenStable();
    const nextEditor = fixture.debugElement.query(By.directive(RecipeEditorComponent))
      .componentInstance as RecipeEditorComponent;
    expect(nextEditor).not.toBe(editor);
    expect(nextEditor.form.controls.title.value).toBe('');

    await router.navigateByUrl('/login');
    await fixture.whenStable();
    expect(document.title).toBe('Sign in · Recipoke');
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
    await router.navigateByUrl('/cookbooks');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Your cookbooks');
    await router.navigateByUrl('/admin');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Accounts Manager');
    await router.navigateByUrl('/invite');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Join Recipoke');
    await router.navigateByUrl('/shopping-lists/shopping-1');
    await fixture.whenStable();
    const tabs = fixture.nativeElement.querySelectorAll('[role=tab]') as NodeListOf<HTMLElement>;
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    tabs[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/shopping-lists/shopping-1');
    expect(fixture.componentInstance.title()).toBe('Shopping list');
    expect(fixture.componentInstance.backTarget()).toBe('/shopping-lists');
    expect(document.title).toBe('Shopping list \u00b7 Recipoke');
    const settings = fixture.debugElement.query(By.directive(ShoppingSettingsComponent))
      .componentInstance as ShoppingSettingsComponent;
    settings.name.setValue('Unsaved list name');
    settings.name.markAsDirty();
    expect(await router.navigateByUrl('/invite')).toBe(false);
    settings.name.markAsPristine();
    expect(await router.navigateByUrl('/invite')).toBe(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-shopping-detail')).toBeNull();
  }, 15000);
});
