// Recouvrement : dossiers en retard par priorité + éditeur des règles (JSON validé par le serveur).
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { ClasseCssPipe, EurosPipe } from '../../core/pipes';
import { PortefeuilleService } from '../../core/portefeuille.service';
import { ReglesService } from '../../core/regles.service';

interface Statut {
  type: 'ok' | 'ko';
  texte?: string;
  erreurs?: string[];
}

@Component({
  selector: 'app-recouvrement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vue vue-recouvrement' },
  imports: [EurosPipe, ClasseCssPipe],
  templateUrl: './recouvrement.html',
})
export class Recouvrement {
  protected readonly p = inject(PortefeuilleService);
  protected readonly regles = inject(ReglesService);

  /** Texte de l'éditeur : suit les règles appliquées, reste modifiable librement. */
  protected readonly texte = linkedSignal(() => JSON.stringify(this.regles.perso() ?? this.regles.defaut(), null, 2));
  protected readonly statut = signal<Statut | null>(null);

  protected async valider(): Promise<void> {
    let config: unknown;
    try {
      config = JSON.parse(this.texte());
    } catch (e) {
      return this.statut.set({ type: 'ko', texte: `JSON invalide : ${(e as Error).message}` });
    }
    try {
      const v = await this.regles.valider(config);
      if (!v.ok) return this.statut.set({ type: 'ko', erreurs: v.erreurs });
      this.regles.appliquer(v.config);
      this.statut.set({
        type: 'ok',
        texte: this.regles.personnalisees()
          ? "Règles personnalisées appliquées : la liste, le tableau de bord et l'assistant les utilisent."
          : 'Règles par défaut appliquées.',
      });
    } catch {
      this.statut.set({ type: 'ko', texte: 'Validation impossible pour le moment.' });
    }
  }

  protected reinitialiser(): void {
    this.texte.set(JSON.stringify(this.regles.defaut(), null, 2));
    this.valider();
  }
}
