// Données du portefeuille, chargées par le serveur MCP sous forme de resources (signals).
// Les priorités de recouvrement se rechargent toutes seules quand les règles changent.
import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { McpService } from './mcp.service';
import { ReglesService } from './regles.service';
import { Contrat, Priorite, TableauDeBord } from './types';

export interface Filtres {
  produit: string;
  statut: string;
  partenaire: string;
  client: string;
}
export const SANS_FILTRE: Filtres = { produit: '', statut: '', partenaire: '', client: '' };

@Injectable({ providedIn: 'root' })
export class PortefeuilleService {
  private readonly mcp = inject(McpService);
  private readonly regles = inject(ReglesService);
  private readonly router = inject(Router);

  readonly tableau = resource({ loader: () => this.mcp.outil<TableauDeBord>('tableau_de_bord') });

  readonly contrats = resource({
    loader: () => this.mcp.outil<{ contrats: Contrat[] }>('rechercher_contrats', { limite: 50 }).then((r) => r.contrats),
  });

  readonly priorites = resource({
    params: () => ({ regles: this.regles.perso() }),
    loader: () => this.mcp.outil<{ priorites: Priorite[] }>('priorites_recouvrement', { limite: 20 }).then((r) => r.priorites),
  });
  /** Top 5 du tableau de bord : les 5 premières priorités. */
  readonly top5 = computed(() => this.priorites.value()?.slice(0, 5));

  /* Filtres de la liste des contrats (partagés : les graphiques du tableau de bord les règlent) */
  readonly filtres = signal<Filtres>(SANS_FILTRE);

  readonly partenaires = computed(() => [...new Set((this.contrats.value() ?? []).map((c) => c.partenaire))].sort());

  readonly contratsVisibles = computed(() => {
    const f = Object.fromEntries(Object.entries(this.filtres()).map(([k, v]) => [k, v.trim().toLowerCase()])) as unknown as Filtres;
    return (this.contrats.value() ?? [])
      .filter(
        (c) =>
          (!f.produit || c.produit.toLowerCase() === f.produit) &&
          (!f.partenaire || c.partenaire.toLowerCase() === f.partenaire) &&
          (!f.client || c.client.toLowerCase().includes(f.client)) &&
          (!f.statut || (f.statut === 'vivants' ? c.statut !== 'soldé' : f.statut === 'retard' ? c.jours_retard > 0 : c.statut === f.statut)),
      )
      .sort((a, b) => b.capital_restant_du - a.capital_restant_du);
  });

  /** Depuis un graphique : règle les filtres puis ouvre la liste des contrats. */
  voirContrats(f: Partial<Filtres>): void {
    this.filtres.set({ ...SANS_FILTRE, ...f });
    this.router.navigate(['/contrats']);
  }
}
