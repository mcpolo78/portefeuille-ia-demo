// Fiche contrat en boîte de dialogue : détail et échéancier lus par le serveur MCP (resource liée à l'identifiant).
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, resource } from '@angular/core';
import { AssistantService } from '../core/assistant.service';
import { InterfaceService } from '../core/interface.service';
import { McpService } from '../core/mcp.service';
import { ClasseCssPipe, DateFrPipe, EurosPipe } from '../core/pipes';
import { dateFr, euros, euros2, nombre } from '../core/formats';
import { DetailContrat, Echeance } from '../core/types';
import { FicheService } from './fiche.service';

const ETATS: Record<string, string> = { 'payée': 'ok', 'impayée': 'ko', 'à venir': 'avenir' };

@Component({
  selector: 'dialog[appFiche]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fiche',
    'aria-labelledby': 'fiche-titre',
    '(click)': 'clicFond($event)',
    '(cancel)': '$event.preventDefault(); fermer()',
  },
  imports: [EurosPipe, DateFrPipe, ClasseCssPipe],
  templateUrl: './fiche-contrat.html',
})
export class FicheContrat {
  protected readonly fiche = inject(FicheService);
  protected readonly assistant = inject(AssistantService);
  private readonly mcp = inject(McpService);
  private readonly ui = inject(InterfaceService);
  private readonly dialogue = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  protected readonly ETATS = ETATS;

  protected readonly donnees = resource({
    params: () => this.fiche.id() ?? undefined,
    loader: async ({ params: id }) => {
      const c = await this.mcp.outil<DetailContrat>('detail_contrat', { id });
      const e = await this.mcp.outil<{ echeances: Echeance[] }>('echeancier_contrat', { id, a_partir_de: Math.max(1, c.echeances_payees - 2), nombre: 12 });
      return { c, echeances: e.echeances };
    },
  });

  protected readonly lignes = computed(() => {
    const c = this.donnees.value()?.c;
    if (!c) return [];
    return [
      ['Client', c.client], ['Produit', c.produit], ['Actif financé', c.actif], ['Partenaire', c.partenaire],
      ['Montant financé', euros.format(c.montant_finance)], ['Apport', euros.format(c.apport)],
      ['Taux annuel', `${nombre.format(c.taux_annuel)} %`], ['Durée', `${c.duree_mois} mois`],
      ['Valeur résiduelle', euros.format(c.valeur_residuelle)], ['Loyer mensuel', euros2.format(c.loyer_mensuel)],
      ['Début → fin', `${dateFr(c.date_debut)} → ${dateFr(c.date_fin)}`], ['Échéances payées', `${c.echeances_payees} / ${c.duree_mois}`],
      ['Capital restant dû', euros2.format(c.capital_restant_du)],
      ['Impayé', c.montant_impaye ? `${euros2.format(c.montant_impaye)} (${c.jours_retard} j de retard)` : 'aucun'],
    ];
  });

  constructor() {
    effect(() => {
      if (this.fiche.id() && !this.dialogue.open) this.dialogue.showModal();
    });
  }

  /** Fermeture animée (fondu), y compris avec Échap. */
  protected fermer(): void {
    const d = this.dialogue;
    if (!d.open || d.classList.contains('fermeture')) return;
    const finir = () => {
      d.classList.remove('fermeture');
      d.close();
      this.fiche.id.set(null);
    };
    if (this.ui.mouvementReduit.matches) return finir();
    d.classList.add('fermeture');
    d.addEventListener('animationend', finir, { once: true });
  }

  protected clicFond(ev: MouseEvent): void {
    if (ev.target === this.dialogue) this.fermer();
  }

  protected demander(question: string): void {
    this.fermer();
    this.assistant.poser(question);
  }
}
