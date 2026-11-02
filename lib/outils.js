// Outils métier exposés à l'IA, une seule définition partagée par le serveur MCP et par l'assistant.
// Chaque outil : nom, description, schéma JSON des paramètres, fonction d'exécution (pure, sur données fictives).

import { CONTRATS, DATE_ARRETE } from './donnees.js';
import { arrondi, mensualite, capitalRestantDu, dateEcheance } from './finance.js';
import { REGLES_DEFAUT, appliquerRegles, scorer } from './regles.js';
import { tableauDeBord } from './tableau.js';

const STATUTS = ['sain', 'impayé', 'contentieux', 'soldé'];
const PRODUITS = ['Crédit-bail', 'LOA', 'LLD', 'Crédit amortissable'];

export class ErreurOutil extends Error {}

function trouverContrat(id) {
  const cle = String(id ?? '').trim().toUpperCase();
  const c = CONTRATS.find((x) => x.id === cle);
  if (!c) throw new ErreurOutil(`Contrat introuvable : « ${id} ». Utilisez rechercher_contrats pour lister les identifiants.`);
  return c;
}

const somme = (liste, champ) => arrondi(liste.reduce((s, x) => s + x[champ], 0));

function resume(c) {
  return {
    id: c.id, client: c.client, produit: c.produit, actif: c.actif, partenaire: c.partenaire,
    statut: c.statut, loyer_mensuel: c.loyer_mensuel, capital_restant_du: c.capital_restant_du,
    montant_impaye: c.montant_impaye, jours_retard: c.jours_retard, date_fin: c.date_fin,
  };
}

export const OUTILS = [
  {
    name: 'tableau_de_bord',
    description: 'Données du tableau de bord : indicateurs clés, évolution mensuelle de l\'encours sur 24 mois (12 passés, 12 projetés), encours par produit et par partenaire, ancienneté des impayés (0-30, 31-60, 61-90, > 90 jours), encaissements attendus sur 6 mois.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    executer() {
      return tableauDeBord();
    },
  },
  {
    name: 'statistiques_portefeuille',
    description: 'Vue d\'ensemble du portefeuille à la date d\'arrêté : encours (capital restant dû), nombre de contrats par statut et par produit, montant et taux d\'impayés.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    executer() {
      const vivants = CONTRATS.filter((c) => c.statut !== 'soldé');
      const enRetard = vivants.filter((c) => c.echeances_impayees > 0);
      const parStatut = Object.fromEntries(STATUTS.map((s) => [s, CONTRATS.filter((c) => c.statut === s).length]));
      const parProduit = Object.fromEntries(PRODUITS.map((p) => {
        const liste = vivants.filter((c) => c.produit === p);
        return [p, { contrats_vivants: liste.length, encours: somme(liste, 'capital_restant_du') }];
      }));
      const encours = somme(vivants, 'capital_restant_du');
      const encoursEnRetard = somme(enRetard, 'capital_restant_du');
      return {
        date_arrete: DATE_ARRETE,
        nombre_contrats: CONTRATS.length,
        contrats_vivants: vivants.length,
        encours_total: encours,
        loyers_mensuels_attendus: somme(vivants, 'loyer_mensuel'),
        montant_impaye_total: somme(enRetard, 'montant_impaye'),
        taux_contrats_en_retard_pct: arrondi((enRetard.length / vivants.length) * 100),
        part_encours_en_retard_pct: arrondi((encoursEnRetard / encours) * 100),
        par_statut: parStatut,
        par_produit: parProduit,
      };
    },
  },
  {
    name: 'rechercher_contrats',
    description: 'Recherche des contrats avec filtres optionnels (retard, statut, produit, partenaire, client, montant minimum) et tri. Pour les contrats « en retard » ou « en impayé » au sens large, utiliser en_retard: true (inclut les statuts impayé ET contentieux). Renvoie au plus 50 contrats résumés.',
    inputSchema: {
      type: 'object',
      properties: {
        en_retard: { type: 'boolean', description: 'true : contrats avec au moins une échéance impayée (statuts impayé et contentieux)' },
        statut: { type: 'string', enum: STATUTS, description: 'Statut exact du contrat (« impayé » exclut « contentieux » : préférer en_retard pour tous les retards)' },
        produit: { type: 'string', enum: PRODUITS, description: 'Type de financement' },
        partenaire: { type: 'string', description: 'Apporteur / distributeur (recherche partielle)' },
        client: { type: 'string', description: 'Nom du client (recherche partielle)' },
        retard_min_jours: { type: 'number', description: 'Retard minimum en jours' },
        montant_min: { type: 'number', description: 'Capital restant dû minimum en euros' },
        tri: { type: 'string', enum: ['capital_restant_du', 'jours_retard', 'montant_impaye', 'date_fin'], description: 'Critère de tri (décroissant, sauf date_fin croissant)' },
        limite: { type: 'number', description: 'Nombre maximum de résultats (1 à 50, 10 par défaut)' },
      },
      additionalProperties: false,
    },
    executer(a = {}) {
      const contient = (texte, motif) => texte.toLowerCase().includes(String(motif).toLowerCase());
      let liste = CONTRATS.filter((c) =>
        (a.en_retard == null || (c.echeances_impayees > 0) === Boolean(a.en_retard)) &&
        (!a.statut || c.statut === a.statut) &&
        (!a.produit || c.produit === a.produit) &&
        (!a.partenaire || contient(c.partenaire, a.partenaire)) &&
        (!a.client || contient(c.client, a.client)) &&
        (a.retard_min_jours == null || c.jours_retard >= a.retard_min_jours) &&
        (a.montant_min == null || c.capital_restant_du >= a.montant_min));
      if (a.tri === 'date_fin') liste.sort((x, y) => x.date_fin.localeCompare(y.date_fin));
      else if (a.tri) liste.sort((x, y) => y[a.tri] - x[a.tri]);
      const limite = Math.min(50, Math.max(1, Math.round(a.limite ?? 10)));
      return { nombre_trouves: liste.length, affiches: Math.min(limite, liste.length), contrats: liste.slice(0, limite).map(resume) };
    },
  },
  {
    name: 'detail_contrat',
    description: 'Fiche complète d\'un contrat : client, actif financé, conditions (montant, apport, taux, durée, valeur résiduelle), échéances payées et impayées, capital restant dû.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identifiant, ex. CT-2024-1234' } },
      required: ['id'],
      additionalProperties: false,
    },
    executer({ id }) {
      const c = trouverContrat(id);
      return { ...c, echeances_restantes: c.duree_mois - c.echeances_echues, cout_total_credit: arrondi(c.loyer_mensuel * c.duree_mois + c.valeur_residuelle - (c.montant_finance - c.apport)) };
    },
  },
  {
    name: 'echeancier_contrat',
    description: 'Tableau d\'amortissement d\'un contrat : pour chaque échéance, date, loyer, part d\'intérêts, part de capital, capital restant dû et état (payée, impayée, à venir).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifiant du contrat' },
        a_partir_de: { type: 'number', description: 'Numéro de la première échéance affichée (par défaut : la première non payée)' },
        nombre: { type: 'number', description: 'Nombre d\'échéances (1 à 24, 12 par défaut)' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    executer({ id, a_partir_de, nombre }) {
      const c = trouverContrat(id);
      const capital = c.montant_finance - c.apport;
      const r = c.taux_annuel / 100 / 12;
      const debut = Math.min(c.duree_mois, Math.max(1, Math.round(a_partir_de ?? c.echeances_payees + 1)));
      const n = Math.min(24, Math.max(1, Math.round(nombre ?? 12)));
      const lignes = [];
      for (let k = debut; k <= Math.min(c.duree_mois, debut + n - 1); k++) {
        const crdAvant = capitalRestantDu(capital, c.taux_annuel, c.loyer_mensuel, k - 1);
        const interets = crdAvant * r;
        const etat = k <= c.echeances_payees ? 'payée' : k <= c.echeances_echues ? 'impayée' : 'à venir';
        lignes.push({
          numero: k, date: dateEcheance(c.date_debut, k), loyer: c.loyer_mensuel,
          interets: arrondi(interets), capital: arrondi(c.loyer_mensuel - interets),
          capital_restant_du: arrondi(capitalRestantDu(capital, c.taux_annuel, c.loyer_mensuel, k)), etat,
        });
      }
      return { id: c.id, client: c.client, duree_mois: c.duree_mois, valeur_residuelle: c.valeur_residuelle, echeances: lignes };
    },
  },
  {
    name: 'simuler_avenant',
    description: 'Simule un avenant sur un contrat vivant : allongement ou réduction de la durée restante, nouveau taux, ou report d\'échéances (les impayés sont réintégrés au capital). Ne modifie rien, renvoie l\'ancien et le nouveau loyer.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifiant du contrat' },
        nouvelle_duree_restante_mois: { type: 'number', description: 'Nouvelle durée restante en mois (1 à 120)' },
        nouveau_taux_annuel: { type: 'number', description: 'Nouveau taux annuel en % (0 à 20)' },
        report_mois: { type: 'number', description: 'Nombre de mois de report avant reprise des loyers (0 à 6)' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    executer({ id, nouvelle_duree_restante_mois, nouveau_taux_annuel, report_mois = 0 }) {
      const c = trouverContrat(id);
      if (c.statut === 'soldé') throw new ErreurOutil(`Le contrat ${c.id} est soldé : pas d'avenant possible.`);
      const restantes = c.duree_mois - c.echeances_echues;
      const duree = Math.min(120, Math.max(1, Math.round(nouvelle_duree_restante_mois ?? restantes)));
      const taux = Math.min(20, Math.max(0, nouveau_taux_annuel ?? c.taux_annuel));
      const report = Math.min(6, Math.max(0, Math.round(report_mois)));
      // Base : capital restant dû + impayés réintégrés, capitalisés pendant le report
      const base = c.capital_restant_du + c.montant_impaye;
      const baseApresReport = base * Math.pow(1 + taux / 100 / 12, report);
      const nouveauLoyer = arrondi(mensualite(baseApresReport, taux, duree, c.valeur_residuelle));
      const ancienCout = c.loyer_mensuel * restantes + c.montant_impaye;
      const nouveauCout = nouveauLoyer * duree;
      return {
        id: c.id, client: c.client,
        avant: { loyer_mensuel: c.loyer_mensuel, duree_restante_mois: restantes, taux_annuel: c.taux_annuel, impayes: c.montant_impaye },
        apres: { loyer_mensuel: nouveauLoyer, duree_restante_mois: duree, taux_annuel: taux, report_mois: report, impayes_reintegres: c.montant_impaye },
        variation_loyer_pct: arrondi(((nouveauLoyer - c.loyer_mensuel) / c.loyer_mensuel) * 100),
        surcout_total: arrondi(nouveauCout - ancienCout),
        nouvelle_date_fin: dateEcheance(dateEcheance(c.date_debut, c.echeances_echues), report + duree),
      };
    },
  },
  {
    name: 'priorites_recouvrement',
    description: 'Liste des contrats en retard classés par priorité de recouvrement, avec l\'action recommandée et son niveau. Le score et les actions viennent des règles de recouvrement configurées (personnalisables sans code).',
    inputSchema: {
      type: 'object',
      properties: { limite: { type: 'number', description: 'Nombre de dossiers (1 à 20, 10 par défaut)' } },
      additionalProperties: false,
    },
    executer({ limite } = {}, contexte = {}) {
      const config = contexte.regles ?? REGLES_DEFAUT;
      const n = Math.min(20, Math.max(1, Math.round(limite ?? 10)));
      const dossiers = CONTRATS.filter((c) => c.echeances_impayees > 0).map((c) => {
        const r = appliquerRegles(c, config);
        return { ...resume(c), score: scorer(c, config), action_recommandee: r.action, niveau: r.niveau, regle_appliquee: r.regle };
      });
      dossiers.sort((x, y) => y.score - x.score);
      return {
        date_arrete: DATE_ARRETE,
        regles: contexte.regles ? 'personnalisées' : 'par défaut',
        dossiers_en_retard: dossiers.length,
        montant_impaye_total: somme(dossiers, 'montant_impaye'),
        priorites: dossiers.slice(0, n),
      };
    },
  },
];

const PAR_NOM = new Map(OUTILS.map((o) => [o.name, o]));

/** Exécute un outil ; renvoie { ok, resultat } ou { ok: false, erreur }. */
export function executerOutil(nom, args, contexte = {}) {
  const outil = PAR_NOM.get(nom);
  if (!outil) return { ok: false, erreur: `Outil inconnu : ${nom}` };
  try {
    return { ok: true, resultat: outil.executer(args && typeof args === 'object' ? args : {}, contexte) };
  } catch (e) {
    if (e instanceof ErreurOutil) return { ok: false, erreur: e.message };
    return { ok: false, erreur: 'Erreur interne de l\'outil' };
  }
}
