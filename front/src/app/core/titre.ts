// Titre de la vue : affiché dans la barre du haut (signal) et dans l'onglet du navigateur.
import { Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class TitreStrategie extends TitleStrategy {
  private readonly title = inject(Title);
  readonly vue = signal('Tableau de bord');

  override updateTitle(etat: RouterStateSnapshot): void {
    const titre = this.buildTitle(etat) ?? 'Tableau de bord';
    this.vue.set(titre);
    this.title.setTitle(`${titre} · Copilote portefeuille · démo IA + MCP`);
  }
}
