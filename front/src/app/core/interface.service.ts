// État de l'interface : thème, menu réductible, panneau de l'assistant (ouvert, largeur réglable).
import { Injectable, computed, signal } from '@angular/core';
import { ecrire, lire } from './stockage';

export const DUREE_PANNEAU = 600;
const LARGEUR_MIN = 420;

@Injectable({ providedIn: 'root' })
export class InterfaceService {
  readonly mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)');

  /* Thème */
  readonly theme = signal<string | null>(lire('theme'));
  basculerTheme(): void {
    const actuel = this.theme();
    const sombre = actuel ? actuel === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    this.theme.set(sombre ? 'light' : 'dark');
    ecrire('theme', this.theme());
  }

  /* Menu : réductible à la main, réduit aussi automatiquement quand l'assistant s'ouvre */
  readonly menuReduit = signal(lire('menu-reduit') === '1');
  private menuReduitAvantIa = false;
  reduireMenu(reduit: boolean, enregistrer = true): void {
    this.menuReduit.set(reduit);
    if (enregistrer) ecrire('menu-reduit', reduit ? '1' : null);
  }

  /* Assistant */
  readonly iaOuverte = signal(false);
  ouvrirAssistant(): void {
    if (this.iaOuverte()) return;
    this.menuReduitAvantIa = this.menuReduit();
    if (innerWidth >= 1100) this.reduireMenu(true, false);
    this.iaOuverte.set(true);
  }
  fermerAssistant(): void {
    if (!this.iaOuverte()) return;
    this.iaOuverte.set(false);
    if (innerWidth >= 1100) this.reduireMenu(this.menuReduitAvantIa, false);
  }

  /* Largeur de la colonne de l'assistant (poignée, flèches, double-clic pour rétablir) */
  private readonly largeur = signal<number | null>(Number(lire('largeur-ia')) || null);
  readonly largeurIa = computed(() => (this.largeur() ? `${this.largeur()}px` : null));
  readonly redimension = signal(false);
  private largeurMax = () => Math.max(LARGEUR_MIN, Math.min(innerWidth * 0.55, innerWidth - 64 - 760));
  reglerLargeur(px: number | null, enregistrer = true): void {
    const w = px === null ? null : Math.round(Math.min(this.largeurMax(), Math.max(LARGEUR_MIN, px)));
    this.largeur.set(w);
    if (enregistrer) ecrire('largeur-ia', w === null ? null : String(w));
  }

  attendre(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, this.mouvementReduit.matches ? 0 : ms));
  }
}
