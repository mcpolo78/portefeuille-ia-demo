// Assistant IA : une question part vers /api/assistant (Ministral 14B avec appels d'outils MCP),
// la réponse arrive en flux (Server-Sent Events) : chaque outil appelé s'affiche pendant que le modèle travaille.
// Si le modèle est indisponible, les questions d'exemple appellent directement l'outil MCP (mode secours).
import { Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { echapper, nombre } from './formats';
import { InterfaceService, DUREE_PANNEAU } from './interface.service';
import { markdown, rendreResultat } from './markdown';
import { McpService } from './mcp.service';
import { ReglesService } from './regles.service';
import { Trace } from './types';

export interface Etape {
  outil: string;
  libelle: string;
  etat: 'en-cours' | 'fait' | 'echec';
  duree_ms?: number;
}

export interface Message {
  id: number;
  role: 'utilisateur' | 'assistant';
  /** HTML sûr (texte échappé avant mise en forme). */
  html: string;
  etapes: Etape[];
  attente: string | null;
  enVol?: boolean;
  arrivee?: boolean;
  secours?: boolean;
}

export interface Secours {
  outil: string;
  args: Record<string, unknown>;
}

const LIBELLES_OUTILS: Record<string, string> = {
  statistiques_portefeuille: 'calcule les statistiques du portefeuille',
  rechercher_contrats: 'recherche des contrats',
  detail_contrat: 'ouvre la fiche du contrat',
  echeancier_contrat: "calcule l'échéancier",
  simuler_avenant: "simule l'avenant",
  priorites_recouvrement: 'applique les règles de recouvrement',
};

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly mcp = inject(McpService);
  private readonly regles = inject(ReglesService);
  private readonly ui = inject(InterfaceService);
  private readonly injector = inject(Injector);

  private idMessage = 0;
  private readonly historique: { role: 'user' | 'assistant'; content: string }[] = [];

  readonly messages = signal<Message[]>([
    {
      id: 0,
      role: 'assistant',
      html: "<p>Bonjour ! Je lis le portefeuille par sept outils MCP. Posez une question, ou cliquez sur ✦ au coin d'un graphique.</p>",
      etapes: [],
      attente: null,
    },
  ]);
  readonly traces = signal<Trace[]>([]);
  /** Une seule question à la fois : les boutons IA restent désactivés jusqu'à la réponse. */
  readonly occupe = signal(false);
  /** Bouton d'où part la question en cours (son étoile tourne). */
  readonly origine = signal<HTMLElement | null>(null);

  private ajouter(m: Omit<Message, 'id'>): number {
    const id = ++this.idMessage;
    this.messages.update((liste) => [...liste, { ...m, id }]);
    return id;
  }
  private modifier(id: number, f: (m: Message) => Partial<Message>): void {
    this.messages.update((liste) => liste.map((m) => (m.id === id ? { ...m, ...f(m) } : m)));
  }
  private tracer(t: Trace): void {
    this.traces.update((liste) => [t, ...liste]);
  }
  private rendu(): Promise<void> {
    return new Promise((r) => afterNextRender(() => r(), { injector: this.injector }));
  }

  async poser(question: string, secours: Secours | null = null, origine: HTMLElement | null = null): Promise<void> {
    if (this.occupe()) return;
    this.occupe.set(true);
    this.origine.set(origine);
    const etaitFerme = !this.ui.iaOuverte();
    this.ui.ouvrirAssistant();

    const idQuestion = this.ajouter({ role: 'utilisateur', html: `<p>${echapper(question)}</p>`, etapes: [], attente: null, enVol: !!origine });
    if (origine) await this.envolerQuestion(origine, idQuestion, etaitFerme);
    this.historique.push({ role: 'user', content: question });
    const id = this.ajouter({ role: 'assistant', html: '', etapes: [], attente: 'Le modèle lit la question' });

    try {
      const final = await this.interroger(id);
      this.historique.push({ role: 'assistant', content: final.reponse || '' });
      const meta = `${(final.trace || []).length} outil(s) · ${nombre.format((final.duree_ms || 0) / 1000)} s${this.regles.personnalisees() ? ' · règles personnalisées' : ''}`;
      this.modifier(id, () => ({ attente: null, html: markdown(final.reponse || '(réponse vide)') + `<p class="meta">${meta}</p>` }));
    } catch (e) {
      this.historique.pop();
      const message = (e as Error).message;
      if (secours) {
        try {
          const t0 = performance.now();
          const res = await this.mcp.outil<Record<string, unknown>>(secours.outil, secours.args);
          this.modifier(id, () => ({
            attente: null,
            secours: true,
            html:
              `<p class="meta">Le modèle est indisponible (${echapper(message)}). Résultat brut de l'outil <code>${echapper(secours.outil)}</code>, appelé directement en MCP :</p>` +
              rendreResultat(res),
          }));
          this.tracer({ outil: secours.outil, arguments: secours.args, resultat: res, duree_ms: Math.round(performance.now() - t0), source: 'MCP direct' });
        } catch {
          this.modifier(id, () => ({ attente: null, html: '<p>Service momentanément indisponible. Réessayez dans un instant.</p>' }));
        }
      } else {
        this.modifier(id, () => ({
          attente: null,
          html: `<p>${echapper(message)} Essayez une des questions d'exemple : elles fonctionnent aussi sans le modèle.</p>`,
        }));
      }
    } finally {
      this.occupe.set(false);
      this.origine.set(null);
    }
  }

  /** Lit le flux d'événements de /api/assistant et met à jour la bulle au fil de l'eau. */
  private async interroger(id: number): Promise<{ reponse?: string; trace?: unknown[]; duree_ms?: number }> {
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: this.historique, flux: true, regles: this.regles.perso() }),
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || 'Erreur');
    }
    let final = null;
    const lecteur = r.body!.getReader();
    const decodeur = new TextDecoder();
    let tampon = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      let fin;
      while ((fin = tampon.indexOf('\n\n')) >= 0) {
        const bloc = tampon.slice(0, fin);
        tampon = tampon.slice(fin + 2);
        const type = bloc.match(/^event: (.*)$/m)?.[1];
        const brut = bloc.match(/^data: (.*)$/m)?.[1];
        if (!type || !brut) continue;
        const d = JSON.parse(brut);
        if (type === 'reflexion' && d.tour > 1) this.modifier(id, () => ({ attente: 'Le modèle analyse les résultats' }));
        if (type === 'etape') {
          this.modifier(id, (m) => ({ etapes: [...m.etapes, { outil: d.outil, libelle: LIBELLES_OUTILS[d.outil] || '', etat: 'en-cours' }] }));
        }
        if (type === 'trace') {
          this.modifier(id, (m) => ({
            etapes: m.etapes.map((e) => (e.etat === 'en-cours' ? { ...e, etat: d.ok === false ? 'echec' : 'fait', duree_ms: d.duree_ms } : e)),
          }));
          this.tracer({ ...d, source: 'IA' });
        }
        if (type === 'fin') final = d;
        if (type === 'erreur') throw new Error(d.message || 'Erreur');
      }
    }
    if (!final) throw new Error('Réponse interrompue.');
    return final;
  }

  /**
   * La question part du bouton cliqué et se pose exactement à la place de sa bulle dans le fil :
   * le panneau finit de s'ouvrir, le fil défile, puis une copie de la bulle vole en arc jusqu'à elle.
   */
  private async envolerQuestion(bouton: HTMLElement, id: number, etaitFerme: boolean): Promise<void> {
    const reveler = () => this.modifier(id, () => ({ enVol: false, arrivee: true }));
    if (this.ui.mouvementReduit.matches) return reveler();
    await this.rendu();
    if (etaitFerme) await this.ui.attendre(DUREE_PANNEAU + 50);
    const bulle = document.querySelector<HTMLElement>(`[data-bulle="${id}"]`);
    const fil = bulle?.parentElement;
    if (!bulle || !fil) return reveler();
    fil.scrollTop = fil.scrollHeight;
    await new Promise(requestAnimationFrame);
    const depart = bouton.getBoundingClientRect();
    const arrivee = bulle.getBoundingClientRect();
    const puce = document.createElement('div');
    puce.className = 'question-volante';
    puce.textContent = bulle.textContent;
    document.body.append(puce);
    puce.style.left = `${arrivee.left}px`;
    puce.style.top = `${arrivee.top}px`;
    puce.style.width = `${arrivee.width}px`;
    const dx = depart.left + depart.width / 2 - (arrivee.left + arrivee.width / 2);
    const dy = depart.top + depart.height / 2 - (arrivee.top + arrivee.height / 2);
    const echelle = Math.max(0.15, depart.width / arrivee.width);
    const vol = puce.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0, filter: 'blur(2px)' },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - 50}px) scale(${(echelle + 1) / 2})`, opacity: 1, filter: 'blur(0)', offset: 0.35 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0)' },
      ],
      { duration: 950, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    );
    await vol.finished.catch(() => {});
    reveler();
    puce.remove();
  }
}
