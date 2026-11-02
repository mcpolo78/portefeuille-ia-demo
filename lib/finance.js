// Calculs financiers : mensualités constantes à terme échu, avec valeur résiduelle éventuelle.

export const arrondi = (x) => Math.round(x * 100) / 100;

/** Mensualité d'un financement de capital C au taux annuel t (en %), sur n mois, avec valeur résiduelle VR. */
export function mensualite(capital, tauxAnnuel, nbMois, valeurResiduelle = 0) {
  const r = tauxAnnuel / 100 / 12;
  if (r === 0) return (capital - valeurResiduelle) / nbMois;
  const actualisation = Math.pow(1 + r, -nbMois);
  return ((capital - valeurResiduelle * actualisation) * r) / (1 - actualisation);
}

/** Capital restant dû après k échéances payées. */
export function capitalRestantDu(capital, tauxAnnuel, paiement, k) {
  const r = tauxAnnuel / 100 / 12;
  if (r === 0) return capital - paiement * k;
  const f = Math.pow(1 + r, k);
  return capital * f - (paiement * (f - 1)) / r;
}

/** Date de l'échéance n (1 = un mois après la date de début), au format AAAA-MM-JJ. */
export function dateEcheance(dateDebut, n) {
  const [a, m, j] = dateDebut.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, j));
  return d.toISOString().slice(0, 10);
}

/** Nombre de mois entiers écoulés entre deux dates AAAA-MM-JJ. */
export function moisEcoules(debut, fin) {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  let mois = (a2 - a1) * 12 + (m2 - m1);
  if (j2 < j1) mois -= 1;
  return Math.max(0, mois);
}

export function joursEntre(debut, fin) {
  return Math.round((Date.parse(fin) - Date.parse(debut)) / 86400000);
}
