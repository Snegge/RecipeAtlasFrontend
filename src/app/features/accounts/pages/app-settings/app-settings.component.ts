import { PwaService } from '../../../../core/services/pwa.service';
import { Component, inject } from '@angular/core';
@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './app-settings.component.html',
  styleUrl: './app-settings.component.scss',
})
export class AppSettingsComponent {
  readonly pwa = inject(PwaService);
}
