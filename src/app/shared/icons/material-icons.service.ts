import { Injectable, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';
import { MATERIAL_ICONS } from './material-icons';

@Injectable({ providedIn: 'root' })
export class MaterialIcons {
  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    for (const [name, svg] of Object.entries(MATERIAL_ICONS)) {
      // This allowlist contains only reviewed, vendored SVGs, never user input.
      registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
    }
  }
}
