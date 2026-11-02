// Interface de la démo : conversation avec l'assistant, piste d'audit des appels d'outils, indicateurs via MCP.
'use strict';

const $ = (sel) => document.querySelector(sel);
const fil = $('#fil');
const journal = $('#journal');
const formulaire = $('#formulaire');
const champ = $('#question');
const boutonEnvoyer = $('#envoyer');
const historique = [];
let nbAppels = 0;
let idRpc = 0;

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/* ---------- Thème ---------- */
function lireTheme() {
  try { return localStorage.getItem('theme'); } catch { return null; }
}
function appliquerTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
}
appliquerTheme(lireTheme());
$('#bouton-theme').addEventListener('click', () => {
  const sombre = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = sombre ? 'light' : 'dark';
  appliquerTheme(t);
  try { localStorage.setItem('theme', t); } catch { /* stockage indisponible */ }
});

/* ---------- Appels MCP (JSON-RPC) ---------- */
async function appelerOutilMcp(nom, args) {
  const r = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method: 'tools/call', params: { name: nom, arguments: args } }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  if (data.result.isError) throw new Error(data.result.content?.[0]?.text || 'Erreur outil');
  return data.result.structuredContent;
}

/* ---------- Indicateurs ---------- */
async function chargerIndicateurs() {
  try {
    const s = await appelerOutilMcp('statistiques_portefeuille', {});
    document.querySelectorAll('[data-kpi]').forEach((el) => {
      const v = s[el.dataset.kpi];
      el.textContent = el.dataset.format === 'euros' ? euros.format(v)
        : el.dataset.format === 'pct' ? `${nombre.format(v)} %` : nombre.format(v);
    });
  } catch {
    document.querySelectorAll('[data-kpi]').forEach((el) => { el.textContent = '–'; });
  }
}

/* ---------- Markdown minimal et sûr (texte échappé avant mise en forme) ---------- */
function echapper(t) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function enLigne(t) {
  return echapper(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}
function markdown(texte) {
  const lignes = texte.replace(/\r/g, '').split('\n');
  const html = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const bloc = [];
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) bloc.push(lignes[i++]);
      const cellules = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const corps = bloc.filter((x) => !/^\s*\|[\s:|-]+\|\s*$/.test(x));
      const [tete, ...rangs] = corps;
      html.push('<div class="table-defile"><table><thead><tr>' + cellules(tete).map((c) => `<th>${enLigne(c)}</th>`).join('') +
        '</tr></thead><tbody>' + rangs.map((r) => '<tr>' + cellules(r).map((c) => `<td>${enLigne(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordonnee = /^\s*\d+[.)]/.test(l);
      const items = [];
      while (i < lignes.length && /^\s*([-*•]|\d+[.)])\s+/.test(lignes[i])) {
        items.push(`<li>${enLigne(lignes[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`);
        i++;
      }
      html.push(ordonnee ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { html.push('<hr>'); i++; continue; }
    const titre = l.match(/^#{1,4}\s+(.*)/);
    if (titre) { html.push(`<p class="titre-md">${enLigne(titre[1])}</p>`); i++; continue; }
    if (l.trim()) {
      const para = [];
      while (i < lignes.length && lignes[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#|-{3,}\s*$)/.test(lignes[i])) para.push(lignes[i++]);
      if (para.length) { html.push(`<p>${para.map(enLigne).join('<br>')}</p>`); continue; }
    }
    i++;
  }
  return html.join('');
}

/* ---------- Conversation ---------- */
function ajouterBulle(role, html, classe = '') {
  const div = document.createElement('div');
  div.className = `bulle ${role} ${classe}`.trim();
  div.innerHTML = html;
  fil.append(div);
  fil.scrollTop = fil.scrollHeight;
  return div;
}

function ajouterTrace(trace, source) {
  for (const t of trace) {
    nbAppels++;
    const li = document.createElement('li');
    li.className = t.ok === false ? 'echec' : '';
    li.innerHTML = `<details><summary><span class="outil">${echapper(t.outil)}</span>` +
      `<span class="muet petit">${source} · ${nombre.format(t.duree_ms ?? 0)} ms</span></summary>` +
      `<p class="petit">Arguments</p><pre>${echapper(JSON.stringify(t.arguments, null, 2))}</pre>` +
      `<p class="petit">Résultat</p><pre>${echapper(JSON.stringify(t.resultat, null, 2))}</pre></details>`;
    journal.prepend(li);
  }
  $('#audit-compte').textContent = `${nbAppels} appel${nbAppels > 1 ? 's' : ''}`;
}

/* Rendu direct d'un résultat d'outil (mode secours, sans le modèle) */
const COLONNES = {
  contrats: ['id', 'client', 'produit', 'statut', 'capital_restant_du', 'jours_retard'],
  priorites: ['id', 'client', 'montant_impaye', 'jours_retard', 'action_recommandee'],
  echeances: ['numero', 'date', 'loyer', 'interets', 'capital', 'etat'],
};
function valeur(cle, v) {
  if (typeof v === 'number' && /montant|capital|loyer|encours|interets|impaye|surcout|valeur/.test(cle)) return euros.format(v);
  if (typeof v === 'number') return nombre.format(v);
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} : ${valeur(k, x)}`).join(' · ');
  return String(v ?? '');
}
function rendreResultat(res) {
  const cleListe = Object.keys(COLONNES).find((k) => Array.isArray(res[k]));
  let html = '<dl class="cles">' + Object.entries(res)
    .filter(([k, v]) => !Array.isArray(v))
    .map(([k, v]) => `<dt>${echapper(k.replace(/_/g, ' '))}</dt><dd>${echapper(valeur(k, v))}</dd>`).join('') + '</dl>';
  if (cleListe) {
    const cols = COLONNES[cleListe];
    html += '<div class="table-defile"><table><thead><tr>' + cols.map((c) => `<th>${echapper(c.replace(/_/g, ' '))}</th>`).join('') +
      '</tr></thead><tbody>' + res[cleListe].map((r) => '<tr>' + cols.map((c) => `<td>${echapper(valeur(c, r[c]))}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }
  return html;
}

function occupe(oui) {
  boutonEnvoyer.disabled = oui;
  champ.disabled = oui;
  document.querySelectorAll('#suggestions button').forEach((b) => { b.disabled = oui; });
}

async function poser(question, secours) {
  ajouterBulle('utilisateur', `<p>${echapper(question)}</p>`);
  historique.push({ role: 'user', content: question });
  const attente = ajouterBulle('assistant', '<p class="attente">Le modèle choisit ses outils<span>.</span><span>.</span><span>.</span></p>');
  occupe(true);
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historique }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.message || 'Erreur'), { donnees: data });
    attente.innerHTML = markdown(data.reponse || '(réponse vide)') +
      `<p class="meta">${(data.trace || []).length} outil(s) · ${nombre.format((data.duree_ms || 0) / 1000)} s</p>`;
    historique.push({ role: 'assistant', content: data.reponse || '' });
    ajouterTrace(data.trace || [], 'IA');
  } catch (e) {
    historique.pop();
    if (secours) {
      try {
        const t0 = performance.now();
        const res = await appelerOutilMcp(secours.outil, secours.args);
        attente.classList.add('secours');
        attente.innerHTML = `<p class="meta">Le modèle est indisponible (${echapper(e.message)}). Résultat brut de l'outil <code>${echapper(secours.outil)}</code>, appelé directement en MCP :</p>` + rendreResultat(res);
        ajouterTrace([{ outil: secours.outil, arguments: secours.args, resultat: res, duree_ms: Math.round(performance.now() - t0) }], 'MCP direct');
      } catch {
        attente.innerHTML = '<p>Service momentanément indisponible. Réessayez dans un instant.</p>';
      }
    } else {
      attente.innerHTML = `<p>${echapper(e.message)} Essayez une des questions d'exemple : elles fonctionnent aussi sans le modèle.</p>`;
    }
  } finally {
    occupe(false);
    fil.scrollTop = fil.scrollHeight;
  }
}

formulaire.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = champ.value.trim();
  if (!q) return;
  champ.value = '';
  poser(q, null);
});
champ.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    formulaire.requestSubmit();
  }
});
document.querySelectorAll('#suggestions button').forEach((b) => {
  b.addEventListener('click', () => poser(b.textContent, { outil: b.dataset.outil, args: JSON.parse(b.dataset.args) }));
});

$('#commande-mcp').textContent = `claude mcp add --transport http portefeuille ${location.origin}/api/mcp`;
chargerIndicateurs();
