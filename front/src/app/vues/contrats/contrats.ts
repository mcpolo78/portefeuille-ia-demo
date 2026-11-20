// Liste des contrats : filtres en signals, liste calculée (computed), tri par restant dû.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ClasseCssPipe, DateFrPipe, EurosPipe } from '../../core/pipes';
import { Filtres, PortefeuilleService, SANS_FILTRE } from '../../core/portefeuille.service';

@Component({
  selector: 'app-contrats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vue vue-contrats' },
  imports: [EurosPipe, DateFrPipe, ClasseCssPipe],
  templateUrl: './contrats.html',
})
export class Contrats {
  protected readonly p = inject(PortefeuilleService);
  protected readonly produits = ['Crédit-bail', 'LOA', 'LLD', 'Crédit amortissable'];
  protected readonly statuts = ['sain', 'impayé', 'contentieux', 'soldé'];

  protected regler(cle: keyof Filtres, ev: Event): void {
    const valeur = (ev.target as HTMLInputElement | HTMLSelectElement).value;
    this.p.filtres.update((f) => ({ ...f, [cle]: valeur }));
  }

  protected effacer(): void {
    this.p.filtres.set(SANS_FILTRE);
  }
}
