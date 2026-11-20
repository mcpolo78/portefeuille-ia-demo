// Panneau latéral de l'assistant : conversation (étapes en direct) et piste d'audit des appels d'outils.
// Ouverture animée en troisième colonne, largeur réglable par une poignée (souris, flèches, double-clic).
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, effect, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AssistantService, Secours } from '../core/assistant.service';
import { DUREE_PANNEAU, InterfaceService } from '../core/interface.service';
import { NombrePipe } from '../core/pipes';
import { JsonPipe } from '@angular/common';

type Onglet = 'conversation' | 'audit';

@Component({
  selector: 'aside[appAssistant]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panneau-ia', 'aria-label': 'Assistant IA', '[inert]': '!ui.iaOuverte()' },
  imports: [NombrePipe, JsonPipe],
  templateUrl: './assistant.html',
})
export class Assistant {
  protected readonly a = inject(AssistantService);
  protected readonly ui = inject(InterfaceService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly fil = viewChild.required<ElementRef<HTMLElement>>('fil');
  private readonly champ = viewChild.required<ElementRef<HTMLTextAreaElement>>('champ');

  protected readonly onglet = signal<Onglet>('conversation');
  protected readonly question = signal('');

  protected readonly suggestions: { texte: string; secours: Secours }[] = [
    { texte: 'Quels dossiers relancer en priorité ?', secours: { outil: 'priorites_recouvrement', args: { limite: 5 } } },
    { texte: 'Résume la santé du portefeuille', secours: { outil: 'statistiques_portefeuille', args: {} } },
    { texte: 'Si on étale CT-2024-1121 sur 24 mois ?', secours: { outil: 'simuler_avenant', args: { id: 'CT-2024-1121', nouvelle_duree_restante_mois: 24 } } },
  ];

  constructor() {
    // Le fil défile jusqu'au dernier message à chaque nouveauté
    afterRenderEffect({
      write: () => {
        this.a.messages();
        const fil = this.fil().nativeElement;
        fil.scrollTo({ top: fil.scrollHeight, behavior: this.ui.mouvementReduit.matches ? 'auto' : 'smooth' });
      },
    });
    // À l'ouverture, le champ prend le focus une fois le panneau arrivé
    effect((nettoyer) => {
      if (!this.ui.iaOuverte()) return;
      const t = setTimeout(() => this.champ().nativeElement.focus({ preventScroll: true }), this.ui.mouvementReduit.matches ? 0 : DUREE_PANNEAU);
      nettoyer(() => clearTimeout(t));
    });
  }

  /** HTML déjà échappé par markdown() : on le marque comme sûr pour garder les boutons de contrat. */
  protected sur(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  protected envoyer(ev?: Event): void {
    ev?.preventDefault();
    const q = this.question().trim();
    if (!q) return;
    this.question.set('');
    this.a.poser(q);
  }

  protected touche(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && !ev.shiftKey) this.envoyer(ev);
  }

  protected toucheOnglet(ev: KeyboardEvent): void {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const suivant: Onglet = this.onglet() === 'conversation' ? 'audit' : 'conversation';
    this.onglet.set(suivant);
    this.hote.querySelector<HTMLElement>(`#onglet-${suivant}`)?.focus();
  }

  /* Poignée de redimensionnement */
  protected saisir(ev: PointerEvent): void {
    ev.preventDefault();
    const poignee = ev.currentTarget as HTMLElement;
    poignee.setPointerCapture(ev.pointerId);
    this.ui.redimension.set(true);
    const deplacer = (e: PointerEvent) => this.ui.reglerLargeur(innerWidth - e.clientX, false);
    const finir = (e: PointerEvent) => {
      poignee.removeEventListener('pointermove', deplacer);
      this.ui.redimension.set(false);
      this.ui.reglerLargeur(innerWidth - e.clientX);
    };
    poignee.addEventListener('pointermove', deplacer);
    poignee.addEventListener('pointerup', finir, { once: true });
    poignee.addEventListener('pointercancel', finir, { once: true });
  }

  protected clavierPoignee(ev: KeyboardEvent): void {
    const pas = ev.shiftKey ? 80 : 24;
    const actuelle = this.hote.getBoundingClientRect().width;
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      this.ui.reglerLargeur(actuelle + pas);
    }
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      this.ui.reglerLargeur(actuelle - pas);
    }
  }
}
