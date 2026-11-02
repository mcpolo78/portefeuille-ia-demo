// Graphiques SVG faits main, sans bibliothèque : courbe, anneau, barres verticales et horizontales, sparkline.
// Chaque graphique occupe exactement sa zone (taille mesurée) et se redessine quand la zone change de taille.
// Couleurs par classes CSS (thème clair et sombre), infobulle commune au survol, clic optionnel.

const NS = 'http://www.w3.org/2000/svg';
const infobulle = document.getElementById('infobulle');

function el(nom, attrs = {}, parent) {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}
function texte(parent, x, y, contenu, attrs = {}) {
  const t = el('text', { x, y, ...attrs }, parent);
  t.textContent = contenu;
  return t;
}

export function montrerInfobulle(html, ev) {
  infobulle.innerHTML = html;
  infobulle.hidden = false;
  const r = infobulle.getBoundingClientRect();
  let x = ev.clientX + 14;
  let y = ev.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y < 8) y = ev.clientY + 16;
  infobulle.style.left = `${x}px`;
  infobulle.style.top = `${y}px`;
}
export function cacherInfobulle() {
  infobulle.hidden = true;
}
function survol(cible, html, clic) {
  cible.addEventListener('pointermove', (ev) => montrerInfobulle(typeof html === 'function' ? html(ev) : html, ev));
  cible.addEventListener('pointerleave', cacherInfobulle);
  if (clic) {
    cible.classList.add('cliquable');
    cible.addEventListener('click', (ev) => { cacherInfobulle(); clic(ev); });
  }
}

/** Nouveau SVG à la taille de la zone ; renvoie { svg, l, h }. */
function toile(zone) {
  zone.replaceChildren();
  const l = Math.max(120, zone.clientWidth);
  const h = Math.max(90, zone.clientHeight);
  const svg = el('svg', { viewBox: `0 0 ${l} ${h}`, role: 'img' }, zone);
  return { svg, l, h };
}

/** Maximum « rond » et graduations pour un axe. */
function echelle(max, n = 4) {
  if (max <= 0) return { max: 1, pas: [0, 1] };
  const brut = max / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= brut);
  const haut = Math.ceil(max / pas) * pas;
  const graduations = [];
  for (let v = 0; v <= haut + 1e-9; v += pas) graduations.push(v);
  return { max: haut, pas: graduations };
}

/* ---------- Courbe (réalisé plein, projeté pointillé, repère « aujourd'hui ») ---------- */
export function courbe(zone, points, { format, formatAxe, indexAuj, titre }) {
  const { svg, l, h } = toile(zone);
  if (titre) el('title', {}, svg).textContent = titre;
  const marge = { g: 46, d: 10, h: 10, b: 22 };
  const valeurs = points.map((p) => p.y);
  const min0 = Math.min(...valeurs);
  const { max, pas } = echelle(Math.max(...valeurs));
  const bas = Math.max(0, Math.floor((min0 * 0.8) / pas[1]) * pas[1]);
  const ticks = pas.filter((v) => v >= bas);
  const X = (i) => marge.g + (i / (points.length - 1)) * (l - marge.g - marge.d);
  const Y = (v) => h - marge.b - ((v - bas) / (max - bas)) * (h - marge.h - marge.b);

  const axe = el('g', { class: 'axe' }, svg);
  for (const v of ticks) {
    el('line', { x1: marge.g, x2: l - marge.d, y1: Y(v), y2: Y(v), class: 'ligne-grille' }, axe);
    texte(axe, marge.g - 6, Y(v) + 3.5, formatAxe(v), { 'text-anchor': 'end' });
  }
  const pasEtiquettes = l < 420 ? 6 : 3;
  points.forEach((p, i) => {
    if (i % pasEtiquettes === 0) texte(axe, X(i), h - 6, p.label, { 'text-anchor': 'middle' });
  });

  const chemin = (de, a) => points.slice(de, a + 1).map((p, k) => `${k ? 'L' : 'M'}${X(de + k).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  el('path', { d: `${chemin(0, indexAuj)}L${X(indexAuj)},${Y(bas)}L${X(0)},${Y(bas)}Z`, class: 'aire' }, svg);
  el('path', { d: chemin(0, indexAuj), class: 'courbe' }, svg);
  el('path', { d: chemin(indexAuj, points.length - 1), class: 'courbe projetee' }, svg);
  el('line', { x1: X(indexAuj), x2: X(indexAuj), y1: marge.h, y2: h - marge.b, class: 'repere-auj' }, svg);
  texte(svg, X(indexAuj) + 4, marge.h + 9, "aujourd'hui", { class: 'etiquette' });
  el('circle', { cx: X(indexAuj), cy: Y(points[indexAuj].y), r: 4, class: 'point' }, svg);

  // Survol : point le plus proche
  const curseur = el('circle', { r: 4, class: 'point', visibility: 'hidden' }, svg);
  const cible = el('rect', { x: marge.g, y: 0, width: l - marge.g - marge.d, height: h - marge.b, class: 'cible' }, svg);
  cible.addEventListener('pointermove', (ev) => {
    const bord = svg.getBoundingClientRect();
    const x = ((ev.clientX - bord.left) / bord.width) * l;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((x - marge.g) / (l - marge.g - marge.d)) * (points.length - 1))));
    curseur.setAttribute('cx', X(i));
    curseur.setAttribute('cy', Y(points[i].y));
    curseur.setAttribute('visibility', 'visible');
    montrerInfobulle(`<strong>${points[i].label}</strong> · ${format(points[i].y)}${points[i].projete ? ' (projeté)' : ''}`, ev);
  });
  cible.addEventListener('pointerleave', () => { curseur.setAttribute('visibility', 'hidden'); cacherInfobulle(); });
}

/* ---------- Anneau avec légende ---------- */
export function anneau(zone, parts, { format, centre, clic }) {
  const { svg, l, h } = toile(zone);
  const total = parts.reduce((s, p) => s + p.valeur, 0) || 1;
  const legendeADroite = l > h * 1.35;
  const taille = legendeADroite ? Math.min(h, l * 0.52) : Math.min(l, h * 0.62);
  const R = taille / 2 - 4;
  const r = R * 0.62;
  const cx = legendeADroite ? R + 4 : l / 2;
  const cy = legendeADroite ? h / 2 : R + 4;
  let angle = -Math.PI / 2;
  for (const p of parts) {
    if (!p.valeur) continue;
    const a = (p.valeur / total) * Math.PI * 2;
    const fin = angle + a - 0.0001;
    const grand = a > Math.PI ? 1 : 0;
    const pt = (rr, t) => `${(cx + rr * Math.cos(t)).toFixed(2)},${(cy + rr * Math.sin(t)).toFixed(2)}`;
    const d = `M${pt(R, angle)}A${R},${R} 0 ${grand} 1 ${pt(R, fin)}L${pt(r, fin)}A${r},${r} 0 ${grand} 0 ${pt(r, angle)}Z`;
    const seg = el('path', { d, class: `segment ${p.classe}` }, svg);
    survol(seg, `<strong>${p.label}</strong> · ${format(p.valeur)} (${Math.round((p.valeur / total) * 100)} %)`, clic && (() => clic(p)));
    angle += a;
  }
  texte(svg, cx, cy - 2, centre.valeur, { 'text-anchor': 'middle', class: 'etiquette centre', 'font-size': Math.max(11, R * 0.26) });
  texte(svg, cx, cy + Math.max(11, R * 0.22), centre.label, { 'text-anchor': 'middle', class: 'etiquette' });

  // Légende
  const lx = legendeADroite ? cx + R + 16 : 8;
  const ly0 = legendeADroite ? h / 2 - (parts.length * 34) / 2 + 12 : cy + R + 18;
  parts.forEach((p, i) => {
    const colonne = legendeADroite ? 0 : i % 2;
    const ligne = legendeADroite ? i : Math.floor(i / 2);
    const x = lx + colonne * (l / 2);
    const y = ly0 + ligne * (legendeADroite ? 34 : 30);
    const g = el('g', {}, svg);
    el('rect', { x, y: y - 9, width: 10, height: 10, rx: 3, class: p.classe }, g);
    texte(g, x + 16, y, p.label, { class: 'etiquette forte' });
    texte(g, x + 16, y + 13, `${format(p.valeur)} · ${Math.round((p.valeur / total) * 100)} %`, { class: 'etiquette' });
    if (clic) survol(g, `Voir les contrats ${p.label}`, () => clic(p));
  });
}

/* ---------- Barres verticales empilées ---------- */
export function barres(zone, items, { format, formatAxe, clic, classeDe }) {
  const { svg, l, h } = toile(zone);
  const marge = { g: 42, d: 6, h: 16, b: 22 };
  const totaux = items.map((it) => it.valeurs.reduce((s, v) => s + v.v, 0));
  const { max, pas } = echelle(Math.max(...totaux, 1));
  const Y = (v) => h - marge.b - (v / max) * (h - marge.h - marge.b);
  const axe = el('g', { class: 'axe' }, svg);
  for (const v of pas) {
    el('line', { x1: marge.g, x2: l - marge.d, y1: Y(v), y2: Y(v), class: 'ligne-grille' }, axe);
    texte(axe, marge.g - 6, Y(v) + 3.5, formatAxe(v), { 'text-anchor': 'end' });
  }
  const largeur = (l - marge.g - marge.d) / items.length;
  const lb = Math.min(46, largeur * 0.6);
  items.forEach((it, i) => {
    const x = marge.g + i * largeur + (largeur - lb) / 2;
    let cumul = 0;
    const g = el('g', {}, svg);
    it.valeurs.forEach((v, k) => {
      if (!v.v) return;
      el('rect', { x, y: Y(cumul + v.v), width: lb, height: Math.max(0, Y(cumul) - Y(cumul + v.v)), rx: 3, class: classeDe ? classeDe(i, k) : v.classe }, g);
      cumul += v.v;
    });
    // Colonnes étroites : on garde les valeurs dans l'infobulle et on raccourcit les mois
    if (largeur >= 50) texte(svg, x + lb / 2, Y(totaux[i]) - 4, it.etiquette ?? formatAxe(totaux[i]), { 'text-anchor': 'middle', class: 'etiquette forte' });
    texte(svg, x + lb / 2, h - 6, largeur >= 50 ? it.label : String(it.label).split(' ')[0], { 'text-anchor': 'middle', class: 'etiquette' });
    survol(g, it.infobulle, clic && (() => clic(it)));
  });
}

/* ---------- Barres horizontales empilées ---------- */
export function barresH(zone, items, { format, clic }) {
  const { svg, l, h } = toile(zone);
  const totaux = items.map((it) => it.valeurs.reduce((s, v) => s + v.v, 0));
  const max = Math.max(...totaux, 1);
  const hauteurLigne = h / items.length;
  const eb = Math.min(14, hauteurLigne * 0.32);
  const largeurUtile = l - 70;
  items.forEach((it, i) => {
    const y0 = i * hauteurLigne + hauteurLigne * 0.18;
    const g = el('g', {}, svg);
    texte(g, 0, y0 + 10, it.label, { class: 'etiquette forte' });
    let x = 0;
    it.valeurs.forEach((v) => {
      const w = (v.v / max) * largeurUtile;
      if (w > 0) el('rect', { x, y: y0 + 16, width: w, height: eb, rx: 3, class: v.classe }, g);
      x += w;
    });
    texte(g, x + 6, y0 + 16 + eb - 2, format(totaux[i]), { class: 'etiquette' });
    survol(g, it.infobulle, clic && (() => clic(it)));
  });
}

/* ---------- Sparkline ---------- */
export function sparkline(svg, valeurs) {
  svg.replaceChildren();
  const l = 100;
  const h = 30;
  svg.setAttribute('viewBox', `0 0 ${l} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const Y = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const X = (i) => (i / (valeurs.length - 1)) * l;
  const d = valeurs.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  el('path', { d: `${d}L${l},${h}L0,${h}Z`, class: 'spark-aire' }, svg);
  el('path', { d, class: 'spark', 'vector-effect': 'non-scaling-stroke' }, svg);
}
