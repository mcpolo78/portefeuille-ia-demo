// Interface de la démo : tableau de bord (graphiques SVG faits main), liste des contrats, recouvrement
// et règles configurables sans code, assistant IA en panneau latéral avec étapes en direct et piste d'audit.
// Toutes les données passent par le serveur MCP de la démo (/api/mcp).
import { courbe, anneau, barres, barresH, sparkline, cacherInfobulle } from './graphiques.js';

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
const mouvementReduit = matchMedia('(prefers-reduced-motion: reduce)');
const attendre = (ms) => new Promise((r) => setTimeout(r, mouvementReduit.matches ? 0 : ms));
function defilerFil() {
  fil.scrollTo({ top: fil.scrollHeight, behavior: mouvementReduit.matches ? 'auto' : 'smooth' });
}

function ajouterBulle(role, html, classe = '') {
  const div = document.createElement('div');
  div.className = `bulle ${role} ${classe}`.trim();
  div.innerHTML = html;
  fil.append(div);
  defilerFil();
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

async function poser(question, secours, origine = null) {
  const etaitFerme = !assistantOuvert();
  ouvrirAssistant();
  if (origine) await envolerQuestion(origine, question, etaitFerme);
  ajouterBulle('utilisateur', `<p>${echapper(question)}</p>`, origine ? 'arrivee' : '');
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
        defilerFil();
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
    defilerFil();
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
    fermerFiche();
    poser(q.dataset.question, null);
  }
});
// Fermeture animée de la fiche (fondu), y compris avec Échap
function fermerFiche() {
  if (!fiche.open || fiche.classList.contains('fermeture')) return;
  if (mouvementReduit.matches) return fiche.close();
  fiche.classList.add('fermeture');
  fiche.addEventListener('animationend', () => { fiche.classList.remove('fermeture'); fiche.close(); }, { once: true });
}
$('#fermer-fiche').addEventListener('click', fermerFiche);
fiche.addEventListener('click', (ev) => { if (ev.target === fiche) fermerFiche(); });
fiche.addEventListener('cancel', (ev) => { ev.preventDefault(); fermerFiche(); });

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

function majEtatRegles() {
  $('#regles-etat').textContent = reglesPerso ? 'règles personnalisées' : 'règles par défaut';
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
    afficherStatut(reglesPerso ? 'Règles personnalisées appliquées : la liste, le tableau de bord et l\'assistant les utilisent.' : 'Règles par défaut appliquées.', 'ok');
    rafraichirPriorites();
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
}

$('#appliquer-regles').addEventListener('click', validerEtAppliquer);
$('#reinitialiser-regles').addEventListener('click', () => {
  editeur.value = JSON.stringify(reglesDefaut, null, 2);
  validerEtAppliquer();
});


/* ---------- Formats compacts pour les graphiques ---------- */
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const libelleMois = (aaaamm) => {
  const [a, m] = aaaamm.split('-').map(Number);
  return `${MOIS[m - 1]} ${String(a).slice(2)}`;
};
function compact(v) {
  if (Math.abs(v) >= 1e6) return `${nombre.format(Math.round(v / 1e4) / 100)} M€`;
  if (Math.abs(v) >= 1e3) return `${nombre.format(Math.round(v / 100) / 10)} k€`;
  return `${nombre.format(Math.round(v))} €`;
}

/* ---------- Navigation entre vues ---------- */
const VUES = { tableau: 'Tableau de bord', contrats: 'Contrats', recouvrement: 'Recouvrement', mcp: 'Serveur MCP' };
let vueActive = null;
function afficherVue(nom) {
  if (!VUES[nom]) nom = 'tableau';
  vueActive = nom;
  for (const v of Object.keys(VUES)) $(`#vue-${v}`).hidden = v !== nom;
  document.querySelectorAll('.menu a').forEach((a) => {
    if (a.dataset.vue === nom) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#titre-vue').textContent = VUES[nom];
  cacherInfobulle();
  if (nom === 'tableau') dessinerTableau();
  if (nom === 'contrats') afficherContrats();
  if (nom === 'recouvrement') rafraichirPriorites();
}
window.addEventListener('hashchange', () => afficherVue(location.hash.slice(1)));

/* ---------- Données (via MCP) ---------- */
let donneesTableau = null;
let tousContrats = null;
async function chargerTableau() {
  donneesTableau = await appelerOutilMcp('tableau_de_bord', {});
  return donneesTableau;
}
async function chargerContrats() {
  if (!tousContrats) tousContrats = (await appelerOutilMcp('rechercher_contrats', { limite: 50 })).contrats;
  return tousContrats;
}

/* ---------- Tableau de bord ---------- */
const CLASSES_PRODUITS = { 'Crédit-bail': 's1', LOA: 's2', LLD: 's3', 'Crédit amortissable': 's4' };

function remplirIndicateurs(t) {
  const k = t.indicateurs;
  $('#kpi-encours').textContent = euros.format(k.encours);
  const v = k.encours_variation_12_mois_pct;
  $('#kpi-encours-var').innerHTML = `<span class="${v >= 0 ? 'hausse' : 'baisse'}">${v >= 0 ? '▲' : '▼'} ${nombre.format(Math.abs(v))} %</span> sur 1 an`;
  $('#kpi-vivants').textContent = k.contrats_vivants;
  $('#kpi-retard').textContent = `${nombre.format(k.taux_contrats_en_retard_pct)} %`;
  $('#kpi-retard-pied').textContent = `${k.contrats_en_retard} dossiers sur ${k.contrats_vivants}`;
  $('#kpi-impaye').textContent = euros.format(k.montant_impaye);
  $('#kpi-loyers').textContent = euros.format(k.loyers_attendus_mois_prochain);
  const risque = t.encaissements_6_mois[0].a_risque;
  $('#kpi-loyers-pied').textContent = `${compact(risque)} à risque`;
  const passe = t.serie_mensuelle.filter((p) => !p.projete);
  sparkline($('#spark-encours'), passe.map((p) => p.encours));
  sparkline($('#spark-vivants'), passe.map((p) => p.vivants));
  sparkline($('#spark-loyers'), passe.map((p) => p.loyers));
}

async function dessinerTableau() {
  if (!donneesTableau) {
    try { await chargerTableau(); } catch { return; }
  }
  const t = donneesTableau;
  remplirIndicateurs(t);

  const serie = t.serie_mensuelle;
  courbe($('#g-encours'), serie.map((p) => ({ label: libelleMois(p.mois), y: p.encours, projete: p.projete })), {
    format: (v) => euros.format(v), formatAxe: compact, indexAuj: serie.findIndex((p) => !p.projete && serie[serie.indexOf(p) + 1]?.projete),
    titre: "Évolution de l'encours sur 24 mois",
  });

  const produits = t.par_produit.filter((p) => p.encours > 0);
  anneau($('#g-produits'), produits.map((p) => ({ label: p.produit, valeur: p.encours, classe: CLASSES_PRODUITS[p.produit] })), {
    format: compact,
    centre: { valeur: compact(t.indicateurs.encours), label: 'encours' },
    clic: (p) => filtrerContrats({ produit: p.label, statut: 'vivants' }),
  });

  barres($('#g-anciennete'), t.anciennete_impayes.map((a) => ({
    label: a.tranche, valeurs: [{ v: a.montant }], etiquette: a.dossiers ? `${a.dossiers} dossier${a.dossiers > 1 ? 's' : ''}` : '',
    infobulle: `<strong>${a.tranche}</strong> · ${euros.format(a.montant)} sur ${a.dossiers} dossier(s)`, tranche: a,
  })), { format: euros.format, formatAxe: compact, classeDe: (i) => `anc-${i}`, clic: () => afficherVueHash('recouvrement') });

  barres($('#g-encaissements'), t.encaissements_6_mois.map((m) => ({
    label: libelleMois(m.mois), valeurs: [{ v: m.sains, classe: 's1' }, { v: m.a_risque, classe: 's4' }],
    infobulle: `<strong>${libelleMois(m.mois)}</strong> · ${euros.format(m.sains + m.a_risque)}<br>dont ${euros.format(m.a_risque)} sur des contrats en retard`,
  })), { format: euros.format, formatAxe: compact });

  barresH($('#g-partenaires'), t.par_partenaire.map((p) => ({
    label: p.partenaire, valeurs: [{ v: p.encours - p.encours_en_retard, classe: 's2' }, { v: p.encours_en_retard, classe: 's4' }],
    infobulle: `<strong>${p.partenaire}</strong> · ${euros.format(p.encours)} sur ${p.contrats} contrats<br>dont ${euros.format(p.encours_en_retard)} en retard (${Math.round((p.encours_en_retard / (p.encours || 1)) * 100)} %)`,
    partenaire: p.partenaire,
  })), { format: compact, clic: (it) => filtrerContrats({ partenaire: it.partenaire, statut: 'vivants' }) });

  dessinerTopRisques();
}

async function dessinerTopRisques(forcer = false) {
  // Le tableau ne dépend pas de la taille : on ne relit le serveur qu'au premier affichage ou quand les règles changent
  if (!forcer && $('#g-risques table')) return;
  try {
    const res = await appelerOutilMcp('priorites_recouvrement', { limite: 5 });
    $('#g-risques').innerHTML = '<table class="top-risques"><colgroup><col><col class="c-num"><col class="c-retard"></colgroup><thead><tr><th>Dossier</th><th class="num">Impayé</th><th class="num">Jours</th></tr></thead><tbody>' +
      res.priorites.map((d) => `<tr><td class="client"><i class="point-niveau niveau-${classe(d.niveau)}" title="Niveau ${echapper(d.niveau)}"></i>${boutonContrat(d.id)}<span class="sous-ligne" title="${echapper(d.client)}">${echapper(d.client)}</span></td><td class="num">${compact(d.montant_impaye)}</td><td class="num">${d.jours_retard} j</td></tr>`).join('') +
      '</tbody></table>';
  } catch {
    $('#g-risques').textContent = 'Indisponible.';
  }
}

// Redessine les graphiques quand leur zone change de taille (fenêtre, panneau)
let attenteRedessin = null;
new ResizeObserver(() => {
  if (vueActive !== 'tableau' || !donneesTableau) return;
  cancelAnimationFrame(attenteRedessin);
  attenteRedessin = requestAnimationFrame(() => dessinerTableau());
}).observe($('.grille-graphiques'));

document.querySelectorAll('.demander').forEach((b) => b.addEventListener('click', () => {
  if (b.disabled) return;
  // Retour visuel : le bouton rebondit, la carte s'illumine, puis la question part vers le fil
  for (const [el, c] of [[b, 'envoye'], [b.closest('.carte'), 'questionnee']]) {
    el.classList.remove(c); void el.offsetWidth; el.classList.add(c);
    el.addEventListener('animationend', () => el.classList.remove(c), { once: true });
  }
  poser(b.dataset.question, null, b);
}));

/* ---------- Contrats ---------- */
const filtres = { produit: $('#f-produit'), statut: $('#f-statut'), partenaire: $('#f-partenaire'), client: $('#f-client') };
function afficherVueHash(nom) {
  if (location.hash.slice(1) === nom) afficherVue(nom);
  else location.hash = nom;
}
function filtrerContrats(f) {
  filtres.produit.value = f.produit || '';
  filtres.statut.value = f.statut || '';
  filtres.partenaire.value = f.partenaire || '';
  filtres.client.value = '';
  afficherVueHash('contrats');
}
async function afficherContrats() {
  let liste;
  try { liste = await chargerContrats(); } catch { return; }
  if (filtres.partenaire.options.length === 1) {
    for (const p of [...new Set(liste.map((c) => c.partenaire))].sort()) filtres.partenaire.add(new Option(p, p));
  }
  const f = Object.fromEntries(Object.entries(filtres).map(([k, e]) => [k, e.value.trim().toLowerCase()]));
  const visibles = liste.filter((c) =>
    (!f.produit || c.produit.toLowerCase() === f.produit) &&
    (!f.partenaire || c.partenaire.toLowerCase() === f.partenaire) &&
    (!f.client || c.client.toLowerCase().includes(f.client)) &&
    (!f.statut || (f.statut === 'vivants' ? c.statut !== 'soldé' : f.statut === 'retard' ? c.jours_retard > 0 : c.statut === f.statut)))
    .sort((a, b) => b.capital_restant_du - a.capital_restant_du);
  $('#f-compte').textContent = `${visibles.length} contrat${visibles.length > 1 ? 's' : ''} sur ${liste.length}`;
  $('#liste-contrats').innerHTML = visibles.map((c) => `<tr>
    <td>${boutonContrat(c.id)}</td><td>${echapper(c.client)}</td><td>${echapper(c.produit)}</td><td>${echapper(c.partenaire)}</td>
    <td class="num">${euros.format(c.capital_restant_du)}</td><td class="num">${euros.format(c.loyer_mensuel)}</td>
    <td class="num">${c.montant_impaye ? euros.format(c.montant_impaye) : '–'}</td>
    <td><span class="statut statut-${classe(c.statut)}">${echapper(c.statut)}</span></td><td>${dateFr(c.date_fin)}</td></tr>`).join('');
}
Object.values(filtres).forEach((e) => e.addEventListener('input', afficherContrats));
$('#f-effacer').addEventListener('click', () => filtrerContrats({}));

/* ---------- Recouvrement ---------- */
async function rafraichirPriorites() {
  try {
    const res = await appelerOutilMcp('priorites_recouvrement', { limite: 20 });
    $('#liste-priorites').innerHTML = res.priorites.map((d) => `<tr>
      <td>${boutonContrat(d.id)}</td><td>${echapper(d.client)}</td><td class="num">${euros.format(d.montant_impaye)}</td>
      <td class="num">${d.jours_retard} j</td><td class="num">${d.score}</td>
      <td><span class="niveau niveau-${classe(d.niveau)}">${echapper(d.niveau)}</span></td><td>${echapper(d.action_recommandee)}</td></tr>`).join('');
  } catch (e) {
    $('#liste-priorites').innerHTML = `<tr><td colspan="7">${echapper(e.message)}</td></tr>`;
  }
  if (vueActive === 'tableau') dessinerTopRisques(true);
  else $('#g-risques').textContent = '';
}

/* ---------- Vue MCP ---------- */
async function afficherOutilsMcp() {
  try {
    const r = await fetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method: 'tools/list' }) });
    const { result } = await r.json();
    $('#outils-mcp').innerHTML = result.tools.map((o) => `<li><code>${echapper(o.name)}</code> : ${echapper(o.description.split('.')[0])}.</li>`).join('');
  } catch { /* liste facultative */ }
}

/* ---------- Panneau de l'assistant (ouverture animée, largeur réglable) ---------- */
const app = $('.app');
const panneauAssistant = $('#assistant');
const DUREE_PANNEAU = 450;
const assistantOuvert = () => app.classList.contains('ia-ouverte');
// Menu de gauche : réductible à la main ; réduit aussi automatiquement quand l'assistant s'ouvre
let menuReduitAvantIa = false;
function reduireMenu(reduit, enregistrer = true) {
  app.classList.toggle('menu-reduit', reduit);
  $('#reduire-menu').setAttribute('aria-expanded', String(!reduit));
  $('#reduire-menu').setAttribute('aria-label', reduit ? 'Déplier le menu' : 'Réduire le menu');
  $('#reduire-menu span').textContent = reduit ? 'Déplier le menu' : 'Réduire le menu';
  if (enregistrer) ecrire('menu-reduit', reduit ? '1' : null);
}
reduireMenu(lire('menu-reduit') === '1', false);
$('#reduire-menu').addEventListener('click', () => reduireMenu(!app.classList.contains('menu-reduit')));

function ouvrirAssistant() {
  if (assistantOuvert()) return;
  menuReduitAvantIa = app.classList.contains('menu-reduit');
  if (innerWidth >= 1100) reduireMenu(true, false);
  app.classList.add('ia-ouverte');
  panneauAssistant.inert = false;
  $('#ouvrir-assistant').setAttribute('aria-expanded', 'true');
  setTimeout(() => champ.focus({ preventScroll: true }), mouvementReduit.matches ? 0 : DUREE_PANNEAU);
}
function fermerAssistant() {
  if (!assistantOuvert()) return;
  app.classList.remove('ia-ouverte');
  if (innerWidth >= 1100) reduireMenu(menuReduitAvantIa, false);
  panneauAssistant.inert = true;
  $('#ouvrir-assistant').setAttribute('aria-expanded', 'false');
  $('#ouvrir-assistant').focus({ preventScroll: true });
}
$('#ouvrir-assistant').addEventListener('click', () => (assistantOuvert() ? fermerAssistant() : ouvrirAssistant()));
$('#fermer-assistant').addEventListener('click', fermerAssistant);
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && assistantOuvert() && !fiche.open) fermerAssistant();
});

/** La question part du bouton cliqué et rejoint le fil de discussion avant d'y apparaître. */
async function envolerQuestion(bouton, question, etaitFerme) {
  if (mouvementReduit.matches) return;
  if (etaitFerme) await attendre(DUREE_PANNEAU * 0.7);
  const depart = bouton.getBoundingClientRect();
  const cible = fil.getBoundingClientRect();
  const dernier = fil.lastElementChild?.getBoundingClientRect();
  const puce = document.createElement('div');
  puce.className = 'question-volante';
  puce.textContent = question;
  document.body.append(puce);
  const l = puce.offsetWidth;
  const h = puce.offsetHeight;
  puce.style.left = `${cible.right - l - 6}px`;
  // La question atterrit là où sa bulle va apparaître (sous le dernier message)
  const haut = Math.min(dernier ? dernier.bottom + 10 : cible.top, Math.min(cible.bottom, innerHeight) - h - 6);
  puce.style.top = `${haut}px`;
  const dx = depart.left + depart.width / 2 - (cible.right - l / 2 - 6);
  const dy = depart.top + depart.height / 2 - (haut + h / 2);
  const vol = puce.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
    { transform: `translate(${dx * 0.85}px, ${dy * 0.85 - 30}px) scale(0.8)`, opacity: 1, offset: 0.25 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  ], { duration: 700, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' });
  await vol.finished.catch(() => {});
  puce.remove();
}

// Poignée : glisser (ou flèches gauche/droite) pour régler la largeur ; double-clic pour rétablir
const poignee = $('#poignee-ia');
const LARGEUR_MIN = 300;
const largeurMax = () => Math.max(LARGEUR_MIN, Math.min(innerWidth * 0.55, innerWidth - 64 - 760));
function reglerLargeur(px, enregistrer = true) {
  if (px === null) {
    app.style.removeProperty('--largeur-ia');
    if (enregistrer) ecrire('largeur-ia', null);
    return;
  }
  const w = Math.round(Math.min(largeurMax(), Math.max(LARGEUR_MIN, px)));
  app.style.setProperty('--largeur-ia', `${w}px`);
  poignee.setAttribute('aria-valuenow', String(w));
  if (enregistrer) ecrire('largeur-ia', String(w));
}
const largeurSauvee = Number(lire('largeur-ia'));
if (largeurSauvee) reglerLargeur(largeurSauvee, false);
poignee.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  poignee.setPointerCapture(ev.pointerId);
  app.classList.add('redimension');
  const deplacer = (e) => reglerLargeur(innerWidth - e.clientX, false);
  const finir = (e) => {
    poignee.removeEventListener('pointermove', deplacer);
    app.classList.remove('redimension');
    reglerLargeur(innerWidth - e.clientX);
  };
  poignee.addEventListener('pointermove', deplacer);
  poignee.addEventListener('pointerup', finir, { once: true });
  poignee.addEventListener('pointercancel', finir, { once: true });
});
poignee.addEventListener('dblclick', () => reglerLargeur(null));
poignee.addEventListener('keydown', (ev) => {
  const pas = ev.shiftKey ? 80 : 24;
  const actuelle = panneauAssistant.getBoundingClientRect().width;
  if (ev.key === 'ArrowLeft') { ev.preventDefault(); reglerLargeur(actuelle + pas); }
  if (ev.key === 'ArrowRight') { ev.preventDefault(); reglerLargeur(actuelle - pas); }
});

/* ---------- Démarrage ---------- */
$('#commande-mcp').textContent = `claude mcp add --transport http portefeuille ${location.origin}/api/mcp`;
afficherOutilsMcp();
initialiserRegles().then(() => afficherVue(location.hash.slice(1)));
