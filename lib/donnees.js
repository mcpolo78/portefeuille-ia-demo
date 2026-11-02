// Portefeuille FICTIF de crédits et de leasings, généré de façon déterministe (même graine = mêmes contrats).
// Aucun client réel : noms inventés.

import { arrondi, mensualite, capitalRestantDu, dateEcheance, moisEcoules, joursEntre } from './finance.js';

export const DATE_ARRETE = '2026-10-31';

function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLIENTS = [
  'Boulangerie Lemoine', 'Transports Garnier', 'Cabinet dentaire Rousseau', 'Imprimerie du Vexin',
  'Ateliers Morel', 'Garage Fabre', 'Ferme des Trois Chênes', 'BTP Lacroix', 'Clinique vétérinaire Blanc',
  'Pressing Moderne', 'Menuiserie Perrin', 'Laboratoire Dumas', 'Taxi Bernard', 'Paysages Roux',
  'Brasserie du Port', 'Électricité Fontaine', 'Kiné Santé Marchand', 'Logistique Vasseur',
  'Plomberie Chevalier', 'Optique Mercier', 'Domaine Lefèvre', 'Ambulances Gautier', 'Studio Photo Masson',
  'Carrosserie Renaud', 'Pharmacie Picard', 'Traiteur Colin', 'Coiffure Lambert', 'Agence Durand Immo',
  'Scierie Bonnet', 'Fromagerie Girard', 'Auto-école Faure', 'Cave Rolland', 'Serres Barbier',
  'Maçonnerie Arnaud', 'Dépannage Moulin', 'Atelier Vélo Brun', 'Centre d\'imagerie Noël', 'Pâtisserie Royer',
  'Location Nicolas', 'Couverture Leclerc',
];

const PRODUITS = {
  'Crédit-bail': {
    actifs: ['Véhicule utilitaire', 'Machine-outil', 'Matériel médical', 'Chariot élévateur', 'Four professionnel'],
    vr: [0.01, 0.05], taux: [3.9, 6.4], durees: [36, 48, 60], montant: [15000, 180000],
  },
  'LOA': {
    actifs: ['Véhicule de tourisme', 'Véhicule utilitaire', 'Tracteur agricole'],
    vr: [0.15, 0.3], taux: [4.5, 7.2], durees: [36, 48, 60], montant: [18000, 95000],
  },
  'LLD': {
    actifs: ['Véhicule de tourisme', 'Parc informatique', 'Véhicule électrique'],
    vr: [0.25, 0.4], taux: [4.9, 7.5], durees: [24, 36, 48], montant: [12000, 70000],
  },
  'Crédit amortissable': {
    actifs: ['Travaux d\'aménagement', 'Fonds de commerce', 'Équipement de cuisine', 'Matériel agricole'],
    vr: [0, 0], taux: [3.5, 6.0], durees: [48, 60, 84], montant: [20000, 250000],
  },
};

const PARTENAIRES = ['Concession Auto Ouest', 'Agri Matériel 78', 'MédicaPro Distribution', 'TechLoc Pro', 'Vente directe'];

function choisir(alea, liste) {
  return liste[Math.floor(alea() * liste.length)];
}

function entre(alea, min, max) {
  return min + alea() * (max - min);
}

function creerContrat(alea, i) {
  const produit = choisir(alea, Object.keys(PRODUITS));
  const p = PRODUITS[produit];
  const montant = Math.round(entre(alea, ...p.montant) / 500) * 500;
  const apport = produit === 'Crédit amortissable' ? 0 : Math.round((montant * choisir(alea, [0, 0, 0.05, 0.1])) / 100) * 100;
  const capital = montant - apport;
  const taux = arrondi(entre(alea, ...p.taux));
  const duree = choisir(alea, p.durees);
  const valeurResiduelle = Math.round(montant * entre(alea, ...p.vr));
  const loyer = arrondi(mensualite(capital, taux, duree, valeurResiduelle));

  // Date de début entre janvier 2021 et septembre 2026
  const moisDebut = Math.floor(entre(alea, 0, 69));
  const annee = 2021 + Math.floor(moisDebut / 12);
  const mois = (moisDebut % 12) + 1;
  const jour = choisir(alea, [1, 5, 10, 15, 20]);
  const dateDebut = `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;

  const echues = Math.min(duree, moisEcoules(dateDebut, DATE_ARRETE));
  let statut = 'sain';
  let impayees = 0;
  if (echues >= duree) {
    statut = 'soldé';
  } else if (echues >= 3) {
    const tirage = alea();
    if (tirage < 0.06) { statut = 'contentieux'; impayees = Math.min(echues, 3 + Math.floor(alea() * 4)); }
    else if (tirage < 0.24) { statut = 'impayé'; impayees = 1 + Math.floor(alea() * 2); }
  }
  const payees = echues - impayees;
  const premiereImpayee = impayees ? dateEcheance(dateDebut, payees + 1) : null;
  const joursRetard = premiereImpayee ? joursEntre(premiereImpayee, DATE_ARRETE) : 0;
  const crd = statut === 'soldé' ? 0 : arrondi(capitalRestantDu(capital, taux, loyer, payees));

  return {
    id: `CT-${annee}-${String(1000 + i * 37 + Math.floor(alea() * 30)).padStart(4, '0')}`,
    client: CLIENTS[i % CLIENTS.length],
    produit,
    actif: choisir(alea, p.actifs),
    partenaire: choisir(alea, PARTENAIRES),
    montant_finance: montant,
    apport,
    valeur_residuelle: valeurResiduelle,
    taux_annuel: taux,
    duree_mois: duree,
    date_debut: dateDebut,
    date_fin: dateEcheance(dateDebut, duree),
    loyer_mensuel: loyer,
    echeances_echues: echues,
    echeances_payees: payees,
    echeances_impayees: impayees,
    montant_impaye: arrondi(impayees * loyer),
    jours_retard: joursRetard,
    capital_restant_du: crd,
    statut,
  };
}

export const CONTRATS = (() => {
  const alea = generateur(20261031);
  return Array.from({ length: 40 }, (_, i) => creerContrat(alea, i));
})();
