"use client";

import { useEffect, useState } from "react";
import { saveEntretien } from "@/app/actions/entretiens";
import type { OneOnOne } from "@/lib/types";

const DELAI_FRAPPE_MS = 800; // on enregistre après cette pause dans la frappe
const DELAI_RELANCE_MS = 10_000; // nouvel essai automatique après une erreur réseau

export type EtatSauvegarde =
  | { k: "repos" | "attente" | "envoi" | "ok" }
  | { k: "erreur"; message: string; deconnecte?: boolean };

// Enregistre la fiche d'un commercial pour un mois : une seule requête à la fois, toujours la dernière version.
class Autosave {
  private attente: OneOnOne | null = null; // dernière version pas encore envoyée
  private enCours = false;
  private minuterie: ReturnType<typeof setTimeout> | undefined;
  etat: EtatSauvegarde = { k: "repos" };
  private ecouteur: ((etat: EtatSauvegarde) => void) | null = null; // la fiche affichée, s'il y en a une

  constructor(
    private repId: string,
    private mois: string,
  ) {}

  private onEtat(etat: EtatSauvegarde) {
    this.etat = etat;
    this.ecouteur?.(etat);
  }

  ecouter(ecouteur: ((etat: EtatSauvegarde) => void) | null) {
    this.ecouteur = ecouteur;
  }

  get nonEnregistre() {
    return this.attente !== null || this.enCours;
  }

  programmer(fiche: OneOnOne) {
    this.attente = fiche;
    this.onEtat({ k: "attente" });
    clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => void this.envoyer(), DELAI_FRAPPE_MS);
  }

  async envoyer() {
    clearTimeout(this.minuterie);
    if (this.enCours || !this.attente) return;
    const fiche = this.attente;
    this.attente = null;
    this.enCours = true;
    this.onEtat({ k: "envoi" });

    let result: Awaited<ReturnType<typeof saveEntretien>>;
    try {
      result = await saveEntretien(this.repId, this.mois, fiche);
    } catch {
      result = { ok: false, error: "Connexion perdue : tes notes restent sur cette page, nouvel essai automatique…" };
    }
    this.enCours = false;

    if (result.ok) {
      // Des modifications sont arrivées pendant l'envoi : on les envoie à leur tour.
      if (this.attente) void this.envoyer();
      else this.onEtat({ k: "ok" });
      return;
    }
    this.attente ??= fiche; // rien de plus récent : on garde cette version pour la renvoyer
    this.onEtat({ k: "erreur", message: result.error, deconnecte: result.deconnecte });
    // Déconnecté : inutile d'insister, on réessaie à la prochaine frappe ou via le bouton.
    if (!result.deconnecte) this.minuterie = setTimeout(() => void this.envoyer(), DELAI_RELANCE_MS);
  }
}

// Un seul Autosave par commercial et par mois, gardé quand on change de fiche : un nouvel essai
// en attente ne peut pas écraser des modifications faites après être revenu sur la fiche.
const instances = new Map<string, Autosave>();
function autosaveDe(repId: string, mois: string) {
  const cle = `${mois}|${repId}`;
  let a = instances.get(cle);
  if (!a) instances.set(cle, (a = new Autosave(repId, mois)));
  return a;
}

// La fiche est remontée à chaque changement de commercial ou de mois.
export function useAutosave(repId: string, mois: string) {
  const [autosave] = useState(() => autosaveDe(repId, mois));
  const [etat, setEtat] = useState<EtatSauvegarde>(() => autosave.etat);

  useEffect(() => {
    autosave.ecouter(setEtat);
    // Réseau revenu : on renvoie tout de suite ce qui attend.
    const enLigne = () => void autosave.envoyer();
    // Fermeture de l'onglet avec des notes pas encore enregistrées (sur n'importe quelle fiche) : confirmation.
    const avantFermeture = (e: BeforeUnloadEvent) => {
      if ([...instances.values()].some((a) => a.nonEnregistre)) e.preventDefault();
    };
    window.addEventListener("online", enLigne);
    window.addEventListener("beforeunload", avantFermeture);
    return () => {
      window.removeEventListener("online", enLigne);
      window.removeEventListener("beforeunload", avantFermeture);
      autosave.ecouter(null);
      void autosave.envoyer(); // changement de commercial ou de mois : on n'attend pas la fin de la pause
    };
  }, [autosave]);

  return {
    etat,
    programmer: (fiche: OneOnOne) => autosave.programmer(fiche),
    reessayer: () => void autosave.envoyer(),
  };
}
