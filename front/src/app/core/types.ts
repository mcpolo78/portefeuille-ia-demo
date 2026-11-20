// Types des réponses des outils MCP du portefeuille (structuredContent).

export interface Indicateurs {
  encours: number;
  encours_variation_12_mois_pct: number;
  contrats_vivants: number;
  contrats_en_retard: number;
  taux_contrats_en_retard_pct: number;
  montant_impaye: number;
  loyers_attendus_mois_prochain: number;
}

export interface TableauDeBord {
  indicateurs: Indicateurs;
  serie_mensuelle: { mois: string; encours: number; vivants: number; loyers: number; projete: boolean }[];
  par_produit: { produit: string; encours: number }[];
  anciennete_impayes: { tranche: string; montant: number; dossiers: number }[];
  encaissements_6_mois: { mois: string; sains: number; a_risque: number }[];
  par_partenaire: { partenaire: string; encours: number; encours_en_retard: number; contrats: number }[];
}

export interface Contrat {
  id: string;
  client: string;
  produit: string;
  partenaire: string;
  statut: string;
  capital_restant_du: number;
  loyer_mensuel: number;
  montant_impaye: number;
  jours_retard: number;
  date_fin: string;
}

export interface DetailContrat extends Contrat {
  actif: string;
  montant_finance: number;
  apport: number;
  taux_annuel: number;
  duree_mois: number;
  valeur_residuelle: number;
  date_debut: string;
  echeances_payees: number;
}

export interface Echeance {
  numero: number;
  date: string;
  loyer: number;
  interets: number;
  capital: number;
  capital_restant_du: number;
  etat: 'payée' | 'impayée' | 'à venir';
}

export interface Priorite {
  id: string;
  client: string;
  montant_impaye: number;
  jours_retard: number;
  score: number;
  niveau: string;
  action_recommandee: string;
}

export interface OutilMcp {
  name: string;
  description: string;
}

/** Un appel d'outil, tel qu'affiché dans la piste d'audit. */
export interface Trace {
  outil: string;
  arguments: unknown;
  resultat: unknown;
  duree_ms: number;
  ok?: boolean;
  source: 'IA' | 'MCP direct';
}
