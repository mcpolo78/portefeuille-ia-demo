// Tableau de bord sur un seul écran : 5 indicateurs avec courbes, 6 graphiques cliquables.
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CompactPipe, ClasseCssPipe, EurosPipe, NombrePipe } from '../../core/pipes';
import { compact, euros, libelleMois } from '../../core/formats';
import { PortefeuilleService } from '../../core/portefeuille.service';
import { Dessin, GraphiqueDirective } from '../../graphiques/graphique.directive';
import { anneau, barres, barresH, courbe } from '../../graphiques/graphiques';
import { Sparkline } from '../../graphiques/sparkline';
import { CarteGraphique } from './carte-graphique';

const CLASSES_PRODUITS: Record<string, string> = { 'Crédit-bail': 's1', LOA: 's2', LLD: 's3', 'Crédit amortissable': 's4' };

@Component({
  selector: 'app-tableau',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vue vue-tableau' },
  imports: [CarteGraphique, GraphiqueDirective, Sparkline, EurosPipe, CompactPipe, NombrePipe, ClasseCssPipe],
  templateUrl: './tableau.html',
})
export class Tableau {
  protected readonly portefeuille = inject(PortefeuilleService);
  private readonly router = inject(Router);

  protected readonly t = this.portefeuille.tableau.value;

  /** Séries des sparklines (mois réalisés seulement). */
  protected readonly passe = computed(() => this.t()?.serie_mensuelle.filter((p) => !p.projete) ?? []);
  protected readonly sparkEncours = computed(() => this.passe().map((p) => p.encours));
  protected readonly sparkVivants = computed(() => this.passe().map((p) => p.vivants));
  protected readonly sparkLoyers = computed(() => this.passe().map((p) => p.loyers));

  /** Une fonction de dessin par graphique, recalculée quand les données arrivent. */
  protected readonly dessins = computed<Record<string, Dessin> | undefined>(() => {
    const t = this.t();
    if (!t) return undefined;
    const serie = t.serie_mensuelle;
    const indexAuj = serie.findIndex((p, i) => !p.projete && serie[i + 1]?.projete);
    return {
      encours: (z) =>
        courbe(z, serie.map((p) => ({ label: libelleMois(p.mois), y: p.encours, projete: p.projete })), {
          format: (v) => euros.format(v),
          formatAxe: compact,
          indexAuj,
          titre: "Évolution de l'encours sur 24 mois",
        }),
      produits: (z) =>
        anneau(z, t.par_produit.filter((p) => p.encours > 0).map((p) => ({ label: p.produit, valeur: p.encours, classe: CLASSES_PRODUITS[p.produit] })), {
          format: compact,
          centre: { valeur: compact(t.indicateurs.encours), label: 'encours' },
          clic: (p) => this.portefeuille.voirContrats({ produit: p.label, statut: 'vivants' }),
        }),
      anciennete: (z) =>
        barres(
          z,
          t.anciennete_impayes.map((a) => ({
            label: a.tranche,
            valeurs: [{ v: a.montant }],
            etiquette: a.dossiers ? `${a.dossiers} dossier${a.dossiers > 1 ? 's' : ''}` : '',
            infobulle: `<strong>${a.tranche}</strong> · ${euros.format(a.montant)} sur ${a.dossiers} dossier(s)`,
          })),
          { formatAxe: compact, classeDe: (i) => `anc-${i}`, clic: () => this.router.navigate(['/recouvrement']) },
        ),
      encaissements: (z) =>
        barres(
          z,
          t.encaissements_6_mois.map((m) => ({
            label: libelleMois(m.mois),
            valeurs: [
              { v: m.sains, classe: 's1' },
              { v: m.a_risque, classe: 's4' },
            ],
            infobulle: `<strong>${libelleMois(m.mois)}</strong> · ${euros.format(m.sains + m.a_risque)}<br>dont ${euros.format(m.a_risque)} sur des contrats en retard`,
          })),
          { formatAxe: compact },
        ),
      partenaires: (z) =>
        barresH(
          z,
          t.par_partenaire.map((p) => ({
            label: p.partenaire,
            valeurs: [
              { v: p.encours - p.encours_en_retard, classe: 's2' },
              { v: p.encours_en_retard, classe: 's4' },
            ],
            infobulle: `<strong>${p.partenaire}</strong> · ${euros.format(p.encours)} sur ${p.contrats} contrats<br>dont ${euros.format(p.encours_en_retard)} en retard (${Math.round((p.encours_en_retard / (p.encours || 1)) * 100)} %)`,
          })),
          { format: compact, clic: (it) => this.portefeuille.voirContrats({ partenaire: it.label, statut: 'vivants' }) },
        ),
    };
  });
}
