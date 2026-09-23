// Sauvegarde des fiches 1:1 dans le navigateur (localStorage), par mois + commercial.
// Sera remplacé par Supabase à l'étape de la base de données.
import { useSyncExternalStore } from "react";
import { emptyOneOnOne, emptySubject } from "./momento";
import type { OneOnOne } from "./types";

type Store = Record<string, OneOnOne>;

const STORAGE_KEY = "momento4";
const EMPTY: Store = {};
const listeners = new Set<() => void>();
let cache: Store | null = null;

function read(): Store {
  if (cache) return cache;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    cache = saved ? (JSON.parse(saved) as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const storeKey = (month: string, repId: string) => `${month}|${repId}`;

export function useOneOnOnes(): Store {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function getOneOnOne(store: Store, month: string, repId: string): OneOnOne {
  const saved = store[storeKey(month, repId)];
  if (!saved) return emptyOneOnOne();
  return { ...emptyOneOnOne(), ...saved, sujets: saved.sujets?.length ? saved.sujets : [emptySubject()] };
}

export function updateOneOnOne(month: string, repId: string, change: (current: OneOnOne) => OneOnOne) {
  const current = read();
  cache = { ...current, [storeKey(month, repId)]: change(getOneOnOne(current, month, repId)) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // stockage indisponible (navigation privée…) : on garde les données en mémoire
  }
  listeners.forEach((listener) => listener());
}
