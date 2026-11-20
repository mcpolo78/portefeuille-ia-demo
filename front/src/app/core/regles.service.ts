// Règles de recouvrement configurables sans code : règles par défaut lues sur /api/regles,
// configuration personnalisée validée par le serveur puis gardée dans le navigateur.
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ecrire, lire } from './stockage';

type Validation = { ok: true; config: unknown } | { ok: false; erreurs: string[] };

@Injectable({ providedIn: 'root' })
export class ReglesService {
  private readonly http = inject(HttpClient);

  readonly defaut = signal<unknown>(null);
  /** Configuration validée par le serveur, ou null = règles par défaut. */
  readonly perso = signal<unknown>(null);
  readonly personnalisees = computed(() => this.perso() !== null);

  /** Lancé au démarrage de l'application (provideAppInitializer). */
  async initialiser(): Promise<void> {
    try {
      this.defaut.set(await firstValueFrom(this.http.get('/api/regles')));
    } catch {
      this.defaut.set(null);
    }
    const sauvegarde = lire('regles');
    if (!sauvegarde) return;
    try {
      const v = await this.valider(JSON.parse(sauvegarde));
      this.perso.set(v.ok ? v.config : null);
    } catch {
      this.perso.set(null);
    }
    if (!this.perso()) ecrire('regles', null);
  }

  valider(config: unknown): Promise<Validation> {
    return firstValueFrom(this.http.post<Validation>('/api/regles', config));
  }

  /** Applique une configuration déjà validée (identique aux règles par défaut → null). */
  appliquer(config: unknown): void {
    const perso = JSON.stringify(config) === JSON.stringify(this.defaut()) ? null : config;
    this.perso.set(perso);
    ecrire('regles', perso ? JSON.stringify(perso) : null);
  }
}
