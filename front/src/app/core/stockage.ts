// Stockage local facultatif (navigation privée, stockage bloqué : on continue sans).

export function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

export function ecrire(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible */
  }
}
