// Dessine un graphique SVG dans sa zone et le redessine quand ses données (signal) ou la taille
// de la zone changent (fenêtre, ouverture du panneau de l'assistant, poignée de redimensionnement).
import { DestroyRef, Directive, ElementRef, afterNextRender, afterRenderEffect, inject, input, signal } from '@angular/core';
import { cacherInfobulle } from './graphiques';

export type Dessin = (zone: HTMLElement) => void;

@Directive({ selector: '[appGraphique]' })
export class GraphiqueDirective {
  readonly dessin = input.required<Dessin | undefined>({ alias: 'appGraphique' });

  private readonly zone = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly taille = signal({ l: 0, h: 0 });

  constructor() {
    const observateur = new ResizeObserver(([e]) => {
      const { width: l, height: h } = e.contentRect;
      const t = this.taille();
      if (Math.round(l) !== Math.round(t.l) || Math.round(h) !== Math.round(t.h)) this.taille.set({ l, h });
    });
    afterNextRender(() => observateur.observe(this.zone));
    inject(DestroyRef).onDestroy(() => {
      observateur.disconnect();
      cacherInfobulle();
    });
    afterRenderEffect({
      write: () => {
        const { l } = this.taille();
        const dessin = this.dessin();
        if (dessin && l > 0) dessin(this.zone);
      },
    });
  }
}
