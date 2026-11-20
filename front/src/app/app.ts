// Ossature : menu à 4 vues | vue courante (router-outlet) | assistant IA en troisième colonne.
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, TitleStrategy } from '@angular/router';
import { Assistant } from './assistant/assistant';
import { AssistantService } from './core/assistant.service';
import { InterfaceService } from './core/interface.service';
import { TitreStrategie } from './core/titre';
import { FicheContrat } from './fiche/fiche-contrat';
import { FicheService } from './fiche/fiche.service';
import { cacherInfobulle } from './graphiques/graphiques';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Assistant, FicheContrat],
  templateUrl: './app.html',
  host: {
    '(document:click)': 'clic($event)',
    '(document:keydown.escape)': 'echap()',
  },
})
export class App {
  protected readonly ui = inject(InterfaceService);
  protected readonly assistant = inject(AssistantService);
  protected readonly titre = (inject(TitleStrategy) as TitreStrategie).vue;
  private readonly fiche = inject(FicheService);

  protected readonly vues = [
    { chemin: '/tableau', libelle: 'Tableau de bord', icone: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z' },
    { chemin: '/contrats', libelle: 'Contrats', icone: 'M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 12h8M9 16h8' },
    { chemin: '/recouvrement', libelle: 'Recouvrement', icone: 'M12 3l9 4v5c0 5-4 8-9 9-5-1-9-4-9-9V7zm-1 13h2v2h-2zm0-8h2v6h-2z' },
    { chemin: '/mcp', libelle: 'Serveur MCP', icone: 'M8 3v5H5v4a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12V8h-3V3h-2v5h-4V3z' },
  ];

  constructor() {
    // Thème choisi : appliqué sur <html> (sinon, celui du système)
    effect(() => {
      const t = this.ui.theme();
      if (t) document.documentElement.dataset['theme'] = t;
    });
  }

  /** Tout bouton [data-contrat] (tableaux, réponses de l'IA) ouvre la fiche du contrat. */
  protected clic(ev: MouseEvent): void {
    const lien = (ev.target as Element).closest<HTMLElement>('[data-contrat]');
    if (lien) this.fiche.ouvrir(lien.dataset['contrat']!);
  }

  protected echap(): void {
    if (this.ui.iaOuverte() && !this.fiche.id()) this.ui.fermerAssistant();
  }

  protected basculerAssistant(): void {
    if (this.ui.iaOuverte()) this.ui.fermerAssistant();
    else this.ui.ouvrirAssistant();
  }

  protected changementVue(): void {
    cacherInfobulle();
  }
}
