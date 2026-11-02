// Interface de la démo : conversation en direct avec l'assistant, piste d'audit, fiches contrat,
// règles de recouvrement configurables sans code. Indicateurs et fiches lus directement par le serveur MCP.
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
let reglesPerso = null; // configuration validée par le serveur, ou null = règles par défaut

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const dateFr = (d) => (d ? d.split('-').reverse().join('/') : '');

/* ---------- Stockage local (facultatif) ---------- */
function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, valeur) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible */ }
}

/* ---------- Thème ---------- */
function appliquerTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
}
appliquerTheme(lire('theme'));
$('#bouton-theme').addEventListener('click', () => {
  const sombre = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = sombre ? 'light' : 'dark';
  appliquerTheme(t);
  ecrire('theme', t);
});

/* ---------- Appels MCP (JSON-RPC) ---------- */
async function appelerOutilMcp(nom, args) {
  const params = { name: nom, arguments: args };
  if (reglesPerso) params._meta = { regles: reglesPerso };
  const r = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method: 'tools/call', params }),
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

const classe = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/gi, '');

function boutonContrat(id) {
  return `<button type="button" class="lien-contrat" data-contrat="${id}" title="Ouvrir la fiche du contrat">${id}</button>`;
}

/* ---------- Markdown minimal et sûr (texte échappé avant mise en forme) ---------- */
function echapper(t) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function enLigne(t) {
  return echapper(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\bCT-\d{4}-\d{4}\b/g, (id) => boutonContrat(id));
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

function ajouterTrace(t, source) {
  nbAppels++;
  const li = document.createElement('li');
  li.className = t.ok === false ? 'echec' : '';
  li.innerHTML = `<details><summary><span class="outil">${echapper(t.outil)}</span>` +
    `<span class="muet petit">${source} · ${nombre.format(t.duree_ms ?? 0)} ms</span></summary>` +
    `<p class="petit">Arguments</p><pre>${echapper(JSON.stringify(t.arguments, null, 2))}</pre>` +
    `<p class="petit">Résultat</p><pre>${echapper(JSON.stringify(t.resultat, null, 2))}</pre></details>`;
  journal.prepend(li);
  $('#audit-compte').textContent = String(nbAppels);
}

/* Rendu direct d'un résultat d'outil (mode secours, sans le modèle) */
const COLONNES = {
  contrats: ['id', 'client', 'produit', 'statut', 'capital_restant_du', 'jours_retard'],
  priorites: ['id', 'client', 'montant_impaye', 'jours_retard', 'niveau', 'action_recommandee'],
  echeances: ['numero', 'date', 'loyer', 'interets', 'capital', 'etat'],
};
function valeur(cle, v) {
  if (typeof v === 'number' && /montant|capital|loyer|encours|interets|impaye|surcout|valeur/.test(cle)) return euros.format(v);
  if (typeof v === 'number') return nombre.format(v);
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} : ${valeur(k, x)}`).join(' · ');
  return String(v ?? '');
}
function cellule(cle, v) {
  if (cle === 'id') return boutonContrat(echapper(String(v)));
  if (cle === 'niveau') return `<span class="niveau niveau-${classe(v)}">${echapper(String(v))}</span>`;
  return echapper(valeur(cle, v));
}
function rendreResultat(res) {
  const cleListe = Object.keys(COLONNES).find((k) => Array.isArray(res[k]));
  let html = '<dl class="cles">' + Object.entries(res)
    .filter(([, v]) => !Array.isArray(v))
    .map(([k, v]) => `<dt>${echapper(k.replace(/_/g, ' '))}</dt><dd>${cellule(k, v)}</dd>`).join('') + '</dl>';
  if (cleListe) {
    const cols = COLONNES[cleListe];
    html += '<div class="table-defile"><table><thead><tr>' + cols.map((c) => `<th>${echapper(c.replace(/_/g, ' '))}</th>`).join('') +
      '</tr></thead><tbody>' + res[cleListe].map((r) => '<tr>' + cols.map((c) => `<td>${cellule(c, r[c])}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }
  return html;
}

function occupe(oui) {
  boutonEnvoyer.disabled = oui;
  champ.disabled = oui;
  document.querySelectorAll('#suggestions button').forEach((b) => { b.disabled = oui; });
}

/* Lecture d'un flux Server-Sent Events renvoyé par /api/assistant */
async function lireFlux(reponse, surEvenement) {
  const lecteur = reponse.body.getReader();
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
      const donnees = bloc.match(/^data: (.*)$/m)?.[1];
      if (type && donnees) surEvenement(type, JSON.parse(donnees));
    }
  }
}

const LIBELLES_OUTILS = {
  statistiques_portefeuille: 'calcule les statistiques du portefeuille',
  rechercher_contrats: 'recherche des contrats',
  detail_contrat: 'ouvre la fiche du contrat',
  echeancier_contrat: 'calcule l\'échéancier',
  simuler_avenant: 'simule l\'avenant',
  priorites_recouvrement: 'applique les règles de recouvrement',
};

async function poser(question, secours) {
  ajouterBulle('utilisateur', `<p>${echapper(question)}</p>`);
  historique.push({ role: 'user', content: question });
  const bulle = ajouterBulle('assistant', '<ol class="etapes"></ol><p class="attente">Le modèle lit la question<span>.</span><span>.</span><span>.</span></p>');
  const etapes = bulle.querySelector('.etapes');
  const attente = bulle.querySelector('.attente');
  occupe(true);
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: historique, flux: true, regles: reglesPerso }),
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || 'Erreur');
    }
    let final = null;
    await lireFlux(r, (type, d) => {
      if (type === 'reflexion' && d.tour > 1) attente.firstChild.textContent = 'Le modèle analyse les résultats';
      if (type === 'etape') {
        const li = document.createElement('li');
        li.className = 'en-cours';
        li.innerHTML = `<code>${echapper(d.outil)}</code> <span>${echapper(LIBELLES_OUTILS[d.outil] || '')}</span>`;
        etapes.append(li);
        fil.scrollTop = fil.scrollHeight;
      }
      if (type === 'trace') {
        const li = etapes.querySelector('li.en-cours');
        if (li) {
          li.className = d.ok === false ? 'echec' : 'fait';
          li.insertAdjacentHTML('beforeend', ` <span class="muet">${nombre.format(d.duree_ms)} ms</span>`);
        }
        ajouterTrace(d, 'IA');
      }
      if (type === 'fin') final = d;
      if (type === 'erreur') throw new Error(d.message || 'Erreur');
    });
    if (!final) throw new Error('Réponse interrompue.');
    attente.remove();
    bulle.insertAdjacentHTML('beforeend', markdown(final.reponse || '(réponse vide)') +
      `<p class="meta">${(final.trace || []).length} outil(s) · ${nombre.format((final.duree_ms || 0) / 1000)} s${reglesPerso ? ' · règles personnalisées' : ''}</p>`);
    historique.push({ role: 'assistant', content: final.reponse || '' });
  } catch (e) {
    historique.pop();
    attente.remove();
    if (secours) {
      try {
        const t0 = performance.now();
        const res = await appelerOutilMcp(secours.outil, secours.args);
        bulle.classList.add('secours');
        bulle.insertAdjacentHTML('beforeend', `<p class="meta">Le modèle est indisponible (${echapper(e.message)}). Résultat brut de l'outil <code>${echapper(secours.outil)}</code>, appelé directement en MCP :</p>` + rendreResultat(res));
        ajouterTrace({ outil: secours.outil, arguments: secours.args, resultat: res, duree_ms: Math.round(performance.now() - t0) }, 'MCP direct');
      } catch {
        bulle.insertAdjacentHTML('beforeend', '<p>Service momentanément indisponible. Réessayez dans un instant.</p>');
      }
    } else {
      bulle.insertAdjacentHTML('beforeend', `<p>${echapper(e.message)} Essayez une des questions d'exemple : elles fonctionnent aussi sans le modèle.</p>`);
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

/* ---------- Fiche contrat ---------- */
const fiche = $('#fiche');
const ficheContenu = $('#fiche-contenu');
const ETATS = { 'payée': 'ok', 'impayée': 'ko', 'à venir': 'avenir' };

async function ouvrirFiche(id) {
  $('#fiche-titre').textContent = id;
  ficheContenu.innerHTML = '<p class="muet">Chargement de la fiche…</p>';
  if (!fiche.open) fiche.showModal();
  try {
    const c = await appelerOutilMcp('detail_contrat', { id });
    const e = await appelerOutilMcp('echeancier_contrat', { id, a_partir_de: Math.max(1, c.echeances_payees - 2), nombre: 12 });
    $('#fiche-titre').innerHTML = `${echapper(c.id)} <span class="statut statut-${classe(c.statut)}">${echapper(c.statut)}</span>`;
    const lignes = [
      ['Client', c.client], ['Produit', c.produit], ['Actif financé', c.actif], ['Partenaire', c.partenaire],
      ['Montant financé', euros.format(c.montant_finance)], ['Apport', euros.format(c.apport)],
      ['Taux annuel', `${nombre.format(c.taux_annuel)} %`], ['Durée', `${c.duree_mois} mois`],
      ['Valeur résiduelle', euros.format(c.valeur_residuelle)], ['Loyer mensuel', euros2.format(c.loyer_mensuel)],
      ['Début → fin', `${dateFr(c.date_debut)} → ${dateFr(c.date_fin)}`], ['Échéances payées', `${c.echeances_payees} / ${c.duree_mois}`],
      ['Capital restant dû', euros2.format(c.capital_restant_du)],
      ['Impayé', c.montant_impaye ? `${euros2.format(c.montant_impaye)} (${c.jours_retard} j de retard)` : 'aucun'],
    ];
    ficheContenu.innerHTML =
      `<dl class="cles fiche-cles">${lignes.map(([k, v]) => `<dt>${k}</dt><dd>${echapper(String(v))}</dd>`).join('')}</dl>` +
      `<h3>Échéancier</h3><div class="table-defile"><table class="echeancier"><thead><tr><th>N°</th><th>Date</th><th>Loyer</th><th>Intérêts</th><th>Capital</th><th>Restant dû</th><th>État</th></tr></thead><tbody>` +
      e.echeances.map((l) => `<tr class="etat-${ETATS[l.etat]}"><td>${l.numero}</td><td>${dateFr(l.date)}</td><td>${euros2.format(l.loyer)}</td><td>${euros2.format(l.interets)}</td><td>${euros2.format(l.capital)}</td><td>${euros2.format(l.capital_restant_du)}</td><td><span class="etat">${l.etat}</span></td></tr>`).join('') +
      '</tbody></table></div>' +
      (c.statut !== 'soldé'
        ? `<div class="fiche-actions"><button type="button" class="bouton" data-question="Simule un étalement du contrat ${c.id} sur 24 mois restants.">Simuler un étalement sur 24 mois</button>
           <button type="button" class="bouton secondaire" data-question="Que recommandes-tu pour le contrat ${c.id} ?">Demander une recommandation</button></div>`
        : '');
  } catch (err) {
    ficheContenu.innerHTML = `<p>${echapper(err.message)}</p>`;
  }
}

document.addEventListener('click', (ev) => {
  const lien = ev.target.closest('[data-contrat]');
  if (lien) return ouvrirFiche(lien.dataset.contrat);
  const q = ev.target.closest('#fiche [data-question]');
  if (q) {
    fiche.close();
    poser(q.dataset.question, null);
  }
});
$('#fermer-fiche').addEventListener('click', () => fiche.close());
fiche.addEventListener('click', (ev) => { if (ev.target === fiche) fiche.close(); });

/* ---------- Onglets ---------- */
const onglets = [...document.querySelectorAll('[role="tab"]')];
function choisirOnglet(onglet) {
  for (const o of onglets) {
    const actif = o === onglet;
    o.setAttribute('aria-selected', String(actif));
    o.tabIndex = actif ? 0 : -1;
    document.getElementById(o.getAttribute('aria-controls')).hidden = !actif;
  }
}
onglets.forEach((o, i) => {
  o.addEventListener('click', () => choisirOnglet(o));
  o.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const suivant = onglets[(i + (ev.key === 'ArrowRight' ? 1 : onglets.length - 1)) % onglets.length];
    choisirOnglet(suivant);
    suivant.focus();
  });
});

/* ---------- Règles de recouvrement (configuration sans code) ---------- */
const editeur = $('#editeur-regles');
const statutRegles = $('#statut-regles');
let reglesDefaut = null;

function afficherStatut(texte, type) {
  statutRegles.className = `statut-regles ${type}`;
  statutRegles.innerHTML = texte;
}

async function apercuRegles() {
  try {
    const res = await appelerOutilMcp('priorites_recouvrement', { limite: 20 });
    const groupes = new Map();
    for (const d of res.priorites) {
      const cle = `${d.niveau}|${d.action_recommandee}`;
      groupes.set(cle, (groupes.get(cle) || 0) + 1);
    }
    $('#apercu-regles').innerHTML = `<p class="petit muet">Effet sur les ${res.dossiers_en_retard} dossiers en retard :</p><table class="apercu"><tbody>` +
      [...groupes].map(([cle, n]) => {
        const [niveau, action] = cle.split('|');
        return `<tr><td><span class="niveau niveau-${classe(niveau)}">${echapper(niveau)}</span></td><td>${echapper(action)}</td><td class="nb">${n}</td></tr>`;
      }).join('') + '</tbody></table>';
  } catch (e) {
    $('#apercu-regles').innerHTML = `<p class="petit">${echapper(e.message)}</p>`;
  }
}

function majEtatRegles() {
  $('#regles-etat').textContent = reglesPerso ? 'perso' : 'défaut';
  $('#regles-etat').classList.toggle('perso', Boolean(reglesPerso));
}

async function validerEtAppliquer() {
  let config;
  try {
    config = JSON.parse(editeur.value);
  } catch (e) {
    return afficherStatut(`JSON invalide : ${echapper(e.message)}`, 'ko');
  }
  try {
    const r = await fetch('/api/regles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    const v = await r.json();
    if (!v.ok) return afficherStatut('<ul>' + v.erreurs.map((x) => `<li>${echapper(x)}</li>`).join('') + '</ul>', 'ko');
    reglesPerso = JSON.stringify(v.config) === JSON.stringify(reglesDefaut) ? null : v.config;
    ecrire('regles', reglesPerso ? JSON.stringify(reglesPerso) : null);
    majEtatRegles();
    afficherStatut(reglesPerso ? 'Règles personnalisées appliquées. Demandez « Quels dossiers relancer en priorité ? » pour les voir à l\'œuvre.' : 'Règles par défaut appliquées.', 'ok');
    apercuRegles();
  } catch {
    afficherStatut('Validation impossible pour le moment.', 'ko');
  }
}

async function initialiserRegles() {
  try {
    reglesDefaut = await (await fetch('/api/regles')).json();
  } catch {
    reglesDefaut = null;
  }
  const sauvegarde = lire('regles');
  if (sauvegarde) {
    try {
      const v = await (await fetch('/api/regles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sauvegarde })).json();
      reglesPerso = v.ok ? v.config : null;
    } catch { reglesPerso = null; }
    if (!reglesPerso) ecrire('regles', null);
  }
  editeur.value = JSON.stringify(reglesPerso || reglesDefaut, null, 2);
  majEtatRegles();
  apercuRegles();
}

$('#appliquer-regles').addEventListener('click', validerEtAppliquer);
$('#reinitialiser-regles').addEventListener('click', () => {
  editeur.value = JSON.stringify(reglesDefaut, null, 2);
  validerEtAppliquer();
});

$('#commande-mcp').textContent = `claude mcp add --transport http portefeuille ${location.origin}/api/mcp`;
chargerIndicateurs();
initialiserRegles();
