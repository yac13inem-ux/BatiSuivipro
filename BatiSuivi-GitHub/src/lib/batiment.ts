/** Une tâche = un travail saisi à la main : nom + avancement (%). */
export interface Task {
  id: string;
  name: string;
  /** Avancement saisi directement, 0–100. */
  pct: number;
}
export interface Apt {
  id: string;
  name: string;
  tasks: Task[];
  /** Espace commun (escalier, ascenseur, palier) : affiché au centre du bâtiment. */
  common?: boolean;
}
export interface Floor { id: string; label: string; apts: Apt[] }
export interface Bloc { id: string; name: string; floors: Floor[] }
export interface Project { id: string; name: string; blocs: Bloc[] }
export interface AppData { projects: Project[] }

export const uid = () => Math.random().toString(36).slice(2, 10);

export const COMMON_NAME = "Espace commun";

export const clampPct = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

/** Moyenne simple. Aucun élément → null (aucun taux affiché). */
export const avg = (values: number[]): number | null =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

export const taskPct = (t: Task) => clampPct(t.pct);

export const aptPct = (a: Apt) => avg(a.tasks.map(taskPct));

export const floorPct = (f: Floor) => avg(f.apts.map(aptPct).filter((v): v is number => v !== null));

export const blocPct = (b: Bloc) => avg(b.floors.map(floorPct).filter((v): v is number => v !== null));

export const fmt = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);

export type Status = "none" | "todo" | "doing" | "done";
export const status = (p: number | null): Status =>
  p === null ? "none" : p >= 100 ? "done" : p <= 0 ? "todo" : "doing";

/* ------------------------------------------------------------------ */
/* Suggestions de travaux : catalogue + noms déjà utilisés            */
/* ------------------------------------------------------------------ */

/** Travaux courants d'un chantier de bâtiment (complétés par la saisie réelle). */
export const WORK_CATALOG = [
  "Installation de chantier",
  "Implantation",
  "Terrassement",
  "Fondations",
  "Béton armé",
  "Coffrage",
  "Ferraillage",
  "Coulage",
  "Maçonnerie",
  "Cloisons",
  "Enduit intérieur",
  "Enduit extérieur",
  "Chape",
  "Étanchéité",
  "Isolation thermique",
  "Carrelage",
  "Faïence",
  "Marbre",
  "Granit",
  "Revêtement mural",
  "Peinture",
  "Faux plafond",
  "Menuiserie aluminium",
  "Menuiserie bois",
  "Portes",
  "Fenêtres",
  "Vitrage",
  "Serrurerie",
  "Garde-corps",
  "Escalier",
  "Charpente",
  "Couverture",
  "Électricité",
  "Plomberie",
  "Sanitaires",
  "Chauffage",
  "Climatisation",
  "Ventilation",
  "Ascenseur",
  "VRD",
  "Assainissement",
  "Voirie",
  "Espaces verts",
  "Nettoyage final",
];

/** Minuscules sans accents : « Maçonnerie » et « maconnerie » se ressemblent. */
export const normalizeName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Noms déjà saisis dans toute l'application, du plus utilisé au moins utilisé. */
export function knownNames(data: AppData): { name: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const p of data.projects) {
    for (const b of p.blocs) {
      for (const f of b.floors) {
        for (const a of f.apts) {
          for (const t of a.tasks) {
            const name = t.name.trim();
            if (!name) continue;
            const key = normalizeName(name);
            const cur = map.get(key);
            if (cur) cur.count++;
            else map.set(key, { name, count: 1 });
          }
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Propositions affichées pendant la frappe : les noms du chantier d'abord,
 * puis le catalogue. Les correspondances en début de mot passent devant.
 */
export function suggestNames(
  query: string,
  known: { name: string; count: number }[],
  limit = 8,
): string[] {
  const merged = new Map<string, { name: string; count: number }>();
  for (const name of WORK_CATALOG) {
    const key = normalizeName(name);
    if (!merged.has(key)) merged.set(key, { name, count: 0 });
  }
  for (const k of known) {
    const key = normalizeName(k.name);
    const cur = merged.get(key);
    if (cur) cur.count = Math.max(cur.count, k.count);
    else merged.set(key, { name: k.name, count: k.count });
  }

  const q = normalizeName(query);
  let items = [...merged.values()];
  if (q) {
    items = items
      .map((x) => ({ ...x, at: normalizeName(x.name).indexOf(q) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => Number(a.at > 0) - Number(b.at > 0) || b.count - a.count || a.name.localeCompare(b.name));
  } else {
    items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return items.slice(0, limit).map((x) => x.name);
}

/* ------------------------------------------------------------------ */
/* Génération rapide : « R+9 · 4 appartements par étage » en un clic   */
/* ------------------------------------------------------------------ */

export const floorLabel = (index: number) => (index === 0 ? "RDC" : String(index));

/** Prochain nom d'appartement en gardant la série utilisée : F1…F4 → F5, A1 → A2. */
export function nextAptName(apts: Apt[], fallback = "A"): string {
  const list = apts.filter((a) => !a.common);
  const last = list[list.length - 1]?.name?.trim() ?? "";
  const m = last.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${fallback}${list.length + 1}`;
}

/**
 * Complète un bloc sans rien supprimer :
 * - crée les étages manquants (RDC, 1, 2, …) avec leurs appartements,
 * - ajoute les appartements manquants à chaque étage (A1, A2, …),
 * - ajoute un espace commun au centre de chaque étage qui n'en a pas.
 */
export function applyGrid(
  bloc: Bloc,
  totalFloors: number,
  aptsPerFloor: number,
  prefix = "A",
): { addedFloors: number; addedApts: number; addedCommons: number } {
  let addedFloors = 0;
  let addedApts = 0;
  let addedCommons = 0;
  const total = Math.max(0, Math.floor(totalFloors));
  const per = Math.max(0, Math.floor(aptsPerFloor));

  for (let i = bloc.floors.length; i < total; i++) {
    bloc.floors.push({ id: uid(), label: floorLabel(i), apts: [] });
    addedFloors++;
  }
  for (const f of bloc.floors) {
    const count = f.apts.filter((a) => !a.common).length;
    for (let j = count; j < per; j++) {
      f.apts.push({ id: uid(), name: `${prefix}${j + 1}`, tasks: [] });
      addedApts++;
    }
    if (!f.apts.some((a) => a.common)) {
      f.apts.push({ id: uid(), name: COMMON_NAME, tasks: [], common: true });
      addedCommons++;
    }
  }
  return { addedFloors, addedApts, addedCommons };
}

/* ------------------------------------------------------------------ */
/* Synthèse des travaux saisis (pour le PDF)                           */
/* ------------------------------------------------------------------ */

export interface WorkRow {
  name: string;
  /** Avancement moyen de ce travail sur tout le bloc. */
  pct: number | null;
  /** Nombre d'appartements où ce travail est saisi. */
  count: number;
}

/** Regroupe les travaux saisis par nom (celui du chantier prime). */
export function workSummary(bloc: Bloc): WorkRow[] {
  const map = new Map<string, { name: string; values: number[] }>();
  for (const f of bloc.floors) {
    for (const a of f.apts) {
      for (const t of a.tasks) {
        const name = t.name.trim();
        if (!name) continue;
        const key = normalizeName(name);
        const cur = map.get(key);
        if (cur) cur.values.push(taskPct(t));
        else map.set(key, { name, values: [taskPct(t)] });
      }
    }
  }
  return [...map.values()]
    .map((g) => ({ name: g.name, pct: avg(g.values), count: g.values.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Persistance locale + migration des anciens formats                  */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

const normTask = (raw: unknown): Task => {
  const t = obj(raw);
  const total = num(t["total"]);
  const pct =
    t["pct"] === undefined ? (total > 0 ? (num(t["done"]) / total) * 100 : 0) : num(t["pct"]);
  return {
    id: str(t["id"]) || uid(),
    name: str(t["name"]),
    pct: Math.round(clampPct(pct)),
  };
};

const normApt = (raw: unknown): Apt => {
  const a = obj(raw);
  const apt: Apt = {
    id: str(a["id"]) || uid(),
    name: str(a["name"]),
    tasks: Array.isArray(a["tasks"]) ? a["tasks"].map(normTask) : [],
  };
  if (a["common"] === true) apt.common = true;
  return apt;
};

const normFloor = (raw: unknown): Floor => {
  const f = obj(raw);
  return {
    id: str(f["id"]) || uid(),
    label: str(f["label"]),
    apts: Array.isArray(f["apts"]) ? f["apts"].map(normApt) : [],
  };
};

const normBloc = (raw: unknown): Bloc => {
  const b = obj(raw);
  return {
    id: str(b["id"]) || uid(),
    name: str(b["name"]),
    floors: Array.isArray(b["floors"]) ? b["floors"].map(normFloor) : [],
  };
};

const normProject = (raw: unknown): Project => {
  const p = obj(raw);
  return {
    id: str(p["id"]) || uid(),
    name: str(p["name"]),
    blocs: Array.isArray(p["blocs"]) ? p["blocs"].map(normBloc) : [],
  };
};

export const normalize = (raw: unknown): AppData => {
  const d = obj(raw);
  return { projects: Array.isArray(d["projects"]) ? d["projects"].map(normProject) : [] };
};

const KEY = "batisuivi-v1";
export const load = (): AppData => {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return normalize(JSON.parse(r));
  } catch {
    /* ignore */
  }
  return { projects: [] };
};
export const save = (d: AppData) => localStorage.setItem(KEY, JSON.stringify(d));
