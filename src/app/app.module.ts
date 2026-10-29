import { provideServiceWorker } from '@angular/service-worker';
import { isDevMode } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { RouteReuseStrategy } from '@angular/router';
import { CookbookRouteReuseStrategy } from './core/guards/cookbook-route-reuse.strategy';
import { NgModule, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { apiInterceptor } from './core/interceptors/api.interceptor';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, SharedModule, MatSidenavModule, AppRoutingModule],
  providers: [
    provideZonelessChangeDetection(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: RouteReuseStrategy, useClass: CookbookRouteReuseStrategy },
    provideHttpClient(withInterceptors([apiInterceptor])),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
