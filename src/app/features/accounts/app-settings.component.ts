import { Component } from '@angular/core';
@Component({
  selector: 'app-settings',
  standalone: false,
  template: `<section class="account-page">
    <p class="eyebrow">YOUR PREFERENCES</p>
    <h1>Settings</h1>
    <div class="account-card settings-placeholder">
      <app-icon name="settings" />
      <h2>App settings</h2>
      <p>There are no app settings yet.</p>
    </div>
  </section>`,
  styleUrl: './accounts.scss',
})
export class AppSettingsComponent {}
