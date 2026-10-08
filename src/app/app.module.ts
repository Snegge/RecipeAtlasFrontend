import { NgModule, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { apiInterceptor } from './core/interceptors/api.interceptor';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, SharedModule, AppRoutingModule],
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([apiInterceptor])),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
