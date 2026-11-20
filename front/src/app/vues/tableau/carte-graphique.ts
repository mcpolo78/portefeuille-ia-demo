// Carte d'un graphique : titre, légende projetée, bouton ✦ IA qui pose la question liée au graphique.
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { AssistantService } from '../../core/assistant.service';

/** Relance une animation CSS même si elle vient de jouer. */
function rejouer(el: HTMLElement, classe: string): void {
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
  el.addEventListener('animationend', () => el.classList.remove(classe), { once: true });
}

@Component({
  selector: 'article[appCarteGraphique]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'carte graphique' },
  template: `
    <header>
      <h2>{{ titre() }}</h2>
      <ng-content select=".legende" />
      <button
        #bouton
        type="button"
        class="demander"
        aria-label="Demander à l'IA"
        [title]="assistant.occupe() ? 'Une question est en cours : attendez la réponse' : 'Demander à l\\'IA'"
        [disabled]="assistant.occupe()"
        [class.en-cours]="enCours()"
        (click)="demander(bouton)"
      >
        <span class="etoile" aria-hidden="true">✦</span>IA
      </button>
    </header>
    <ng-content />
  `,
})
export class CarteGraphique {
  readonly titre = input.required<string>({ alias: 'appCarteGraphique' });
  readonly question = input.required<string>();

  protected readonly assistant = inject(AssistantService);
  private readonly carte = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly enCours = computed(() => {
    const o = this.assistant.origine();
    return !!o && this.carte.contains(o);
  });

  protected demander(bouton: HTMLButtonElement): void {
    if (this.assistant.occupe()) return;
    // Retour visuel : le bouton rebondit, la carte s'illumine, puis la question part vers le fil
    rejouer(bouton, 'envoye');
    rejouer(this.carte, 'questionnee');
    this.assistant.poser(this.question(), null, bouton);
  }
}
