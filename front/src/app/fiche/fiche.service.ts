import { Injectable, signal } from '@angular/core';

/** Contrat dont la fiche est ouverte (null = fermée). Tout bouton [data-contrat] l'ouvre. */
@Injectable({ providedIn: 'root' })
export class FicheService {
  readonly id = signal<string | null>(null);
  ouvrir(id: string): void {
    this.id.set(id);
  }
}
