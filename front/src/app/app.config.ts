import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { ReglesService } from './core/regles.service';
import { TitreStrategie } from './core/titre';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withFetch()),
    { provide: TitleStrategy, useClass: TitreStrategie },
    // Les règles de recouvrement (par défaut ou gardées par le navigateur) sont lues avant le premier affichage
    provideAppInitializer(() => inject(ReglesService).initialiser()),
  ],
};
