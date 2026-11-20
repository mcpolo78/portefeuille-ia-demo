// Markdown minimal et sûr : le texte est échappé AVANT la mise en forme, donc le HTML produit
// ne contient que nos balises. Les identifiants CT-… deviennent des boutons qui ouvrent la fiche.
import { echapper, euros, nombre, classeCss } from './formats';

export function boutonContrat(id: string): string {
  return `<button type="button" class="lien-contrat" data-contrat="${id}" title="Ouvrir la fiche du contrat">${id}</button>`;
}

function enLigne(t: string): string {
  return echapper(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\bCT-\d{4}-\d{4}\b/g, (id) => boutonContrat(id));
}

const NUMERIQUE = /^[-+~≈]?\s*[\d\s  .,]+\s*(€|k€|M€|%|j|jours|mois)?$/;

export function markdown(texte: string): string {
  const lignes = texte.replace(/\r/g, '').split('\n');
  const html: string[] = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const bloc: string[] = [];
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) bloc.push(lignes[i++]);
      const cellules = (x: string) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [tete, ...rangs] = bloc.filter((x) => !/^\s*\|[\s:|-]+\|\s*$/.test(x));
      html.push(
        '<div class="table-defile"><table><thead><tr>' +
          cellules(tete).map((c) => `<th>${enLigne(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rangs
            .map((r) => '<tr>' + cellules(r).map((c) => `<td${NUMERIQUE.test(c.replace(/\*/g, '')) ? ' class="num"' : ''}>${enLigne(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordonnee = /^\s*\d+[.)]/.test(l);
      const items: string[] = [];
      while (i < lignes.length && /^\s*([-*•]|\d+[.)])\s+/.test(lignes[i])) {
        items.push(`<li>${enLigne(lignes[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`);
        i++;
      }
      html.push(ordonnee ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      html.push('<hr>');
      i++;
      continue;
    }
    const titre = l.match(/^#{1,4}\s+(.*)/);
    if (titre) {
      html.push(`<p class="titre-md">${enLigne(titre[1])}</p>`);
      i++;
      continue;
    }
    if (l.trim()) {
      const para: string[] = [];
      while (i < lignes.length && lignes[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#|-{3,}\s*$)/.test(lignes[i])) para.push(lignes[i++]);
      if (para.length) {
        html.push(`<p>${para.map(enLigne).join('<br>')}</p>`);
        continue;
      }
    }
    i++;
  }
  return html.join('');
}

/* Rendu direct d'un résultat d'outil (mode secours, sans le modèle) */
const COLONNES: Record<string, string[]> = {
  contrats: ['id', 'client', 'produit', 'statut', 'capital_restant_du', 'jours_retard'],
  priorites: ['id', 'client', 'montant_impaye', 'jours_retard', 'niveau', 'action_recommandee'],
  echeances: ['numero', 'date', 'loyer', 'interets', 'capital', 'etat'],
};

function valeur(cle: string, v: unknown): string {
  if (typeof v === 'number' && /montant|capital|loyer|encours|interets|impaye|surcout|valeur/.test(cle)) return euros.format(v);
  if (typeof v === 'number') return nombre.format(v);
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} : ${valeur(k, x)}`).join(' · ');
  return String(v ?? '');
}

function cellule(cle: string, v: unknown): string {
  if (cle === 'id') return boutonContrat(echapper(String(v)));
  if (cle === 'niveau') return `<span class="niveau niveau-${classeCss(v)}">${echapper(String(v))}</span>`;
  return echapper(valeur(cle, v));
}

export function rendreResultat(res: Record<string, unknown>): string {
  const cleListe = Object.keys(COLONNES).find((k) => Array.isArray(res[k]));
  let html =
    '<dl class="cles">' +
    Object.entries(res)
      .filter(([, v]) => !Array.isArray(v))
      .map(([k, v]) => `<dt>${echapper(k.replace(/_/g, ' '))}</dt><dd>${cellule(k, v)}</dd>`)
      .join('') +
    '</dl>';
  if (cleListe) {
    const cols = COLONNES[cleListe];
    const lignes = res[cleListe] as Record<string, unknown>[];
    html +=
      '<div class="table-defile"><table><thead><tr>' +
      cols.map((c) => `<th>${echapper(c.replace(/_/g, ' '))}</th>`).join('') +
      '</tr></thead><tbody>' +
      lignes.map((r) => '<tr>' + cols.map((c) => `<td>${cellule(c, r[c])}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }
  return html;
}
