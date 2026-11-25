import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Building2, Box, Check, ChevronLeft, ChevronRight, FileDown, Home, Layers, Minus, Pencil, Plus,
  Trash2, Wand2, X,
} from "lucide-react";
import {
  applyGrid, aptPct, blocPct, clampPct, COMMON_NAME, floorPct, fmt, knownNames, load, nextAptName, save, status, suggestNames, taskPct, uid,
  type AppData, type Bloc, type Project, type Status, type Task,
} from "@/lib/batiment";
import { buildPdf, type Shot } from "@/lib/pdf";
import type { Angle, View } from "@/components/Building3D";

const Building3D = lazy(() => import("@/components/Building3D").then((m) => ({ default: m.Building3D })));

export const Route = createFileRoute("/")({
  ssr: false,
  component: App,
  head: () => ({
    meta: [
      { title: "BatiSuivi — Suivi des travaux" },
      { name: "description", content: "Saisie manuelle de l'avancement des travaux (%), vue 3D par étage et rapport PDF." },
      { property: "og:title", content: "BatiSuivi — Suivi des travaux" },
      { property: "og:description", content: "Avancement par bloc, étage et appartement avec vue 3D et PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const BG: Record<Status, string> = { none: "bg-neutral", todo: "bg-destructive", doing: "bg-warning", done: "bg-success" };
const TXT: Record<Status, string> = { none: "text-muted-foreground", todo: "text-destructive", doing: "text-warning", done: "text-success" };
const LEGEND: Record<Exclude<Status, "none">, string> = { done: "Terminé", doing: "En cours", todo: "Non démarré" };
const QUICK = [0, 25, 50, 75, 100];

type Sel = { p: string; b: string; f: string; a: string };
const EMPTY_SEL: Sel = { p: "", b: "", f: "", a: "" };
const SEL_KEY = "batisuivi-sel";

const loadSel = (): Sel => {
  try {
    const raw = localStorage.getItem(SEL_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      return { p: str(o["p"]), b: str(o["b"]), f: str(o["f"]), a: str(o["a"]) };
    }
  } catch {
    /* ignore */
  }
  return EMPTY_SEL;
};

const SHOTS: { angle: Angle; label: string }[] = [
  { angle: "iso", label: "Vue 3D" },
  { angle: "front", label: "Façade" },
  { angle: "back", label: "Arrière" },
  { angle: "left", label: "Côté gauche" },
  { angle: "right", label: "Côté droit" },
];

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(""); } };
  return (
    <div className="flex gap-2">
      <input className="field min-w-0 flex-1" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button className="btn-primary" onClick={go} disabled={!v.trim()}><Plus size={16} /></button>
    </div>
  );
}

function Section({ icon, title, right, children }: { icon: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel space-y-3">
      <div className="flex items-center gap-2"><span className="text-primary">{icon}</span><h2 className="flex-1 font-bold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

/** Génération en une fois : nombre de niveaux + appartements par étage. */
function GridBuilder({ bloc, onApply }: { bloc: Bloc; onApply: (floors: number, apts: number, prefix: string) => void }) {
  const maxApts = bloc.floors.reduce((m, f) => Math.max(m, f.apts.length), 0);
  const [open, setOpen] = useState(bloc.floors.length === 0);
  const [floors, setFloors] = useState(String(bloc.floors.length || 10));
  const [apts, setApts] = useState(String(maxApts || 4));
  const [prefix, setPrefix] = useState("A");
  const nf = Math.floor(Number(floors));
  const na = Math.floor(Number(apts));
  const ok = nf > 0 && na > 0 && nf <= 100 && na <= 50;

  if (!open) {
    return (
      <button className="btn-ghost w-full justify-start" onClick={() => setOpen(true)}>
        <Wand2 size={16} className="text-primary" /> Génération rapide (étages et appartements)
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl bg-background/50 p-2">
      <button className="flex w-full items-center gap-2 text-sm font-semibold" onClick={() => setOpen(false)}>
        <Wand2 size={16} className="text-primary" /> Génération rapide (étages et appartements)
        <ChevronLeft size={16} className="ml-auto -rotate-90 opacity-60" />
      </button>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1 text-[11px] text-muted-foreground">Étages
          <input className="field w-full py-1 text-center" type="number" inputMode="numeric" min={1} max={100} value={floors} onChange={(e) => setFloors(e.target.value)} />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">Appts / étage
          <input className="field w-full py-1 text-center" type="number" inputMode="numeric" min={1} max={50} value={apts} onChange={(e) => setApts(e.target.value)} />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">Préfixe
          <input className="field w-full py-1 text-center" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
      </div>
      <button className="btn-primary w-full" disabled={!ok} onClick={() => ok && onApply(nf, na, prefix.trim() || "A")}>
        <Layers size={16} /> Générer {nf > 1 ? `R+${nf - 1} · ${nf} niveaux` : "RDC"} × {na} appts
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Crée uniquement les étages et appartements manquants (RDC, 1, 2…) sans rien supprimer.
      </p>
    </div>
  );
}

function TaskRow({ task, onPatch, onDelete }: { task: Task; onPatch: (p: Partial<Task>) => void; onDelete: () => void }) {
  const p = taskPct(task);
  const s = status(p);
  const set = (v: number) => onPatch({ pct: clampPct(v) });
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/50 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{task.name}</span>
        <span className={`shrink-0 text-lg font-extrabold ${TXT[s]}`}>{fmt(p)}</span>
        <button className="btn-ghost size-9 shrink-0 p-0" aria-label="Supprimer" onClick={onDelete}><Trash2 size={14} /></button>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-ghost size-10 p-0" aria-label="Moins 5%" onClick={() => set(p - 5)}><Minus size={17} /></button>
        <input type="number" inputMode="numeric" min={0} max={100} step={1}
          className="field min-w-0 flex-1 py-1 text-center text-base font-bold" value={task.pct}
          onChange={(e) => set(clampPct(Number(e.target.value) || 0))} />
        <button className="btn-ghost size-10 p-0" aria-label="Plus 5%" onClick={() => set(p + 5)}><Plus size={17} /></button>
      </div>

      <input type="range" min={0} max={100} step={1} className="w-full" style={{ accentColor: "var(--color-primary)" }}
        value={p} onChange={(e) => set(clampPct(Number(e.target.value)))} />

      <div className="flex gap-1">
        {QUICK.map((q) => (
          <button key={q} onClick={() => set(q)}
            className={`h-8 flex-1 rounded-lg text-xs font-bold transition-colors ${p === q ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>
            {q}%
          </button>
        ))}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background/60"><div className={`h-full ${BG[s]}`} style={{ width: `${p}%` }} /></div>
    </div>
  );
}

function TaskForm({ known, onAdd }: { known: { name: string; count: number }[]; onAdd: (t: Omit<Task, "id">) => void }) {
  const [name, setName] = useState("");
  const [pct, setPct] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const nameRef = useRef<HTMLInputElement>(null);
  const list = useMemo(() => suggestNames(name, known), [name, known]);
  const ok = name.trim().length > 0;

  const pick = (v: string) => {
    setName(v);
    setOpen(false);
    setActive(-1);
    nameRef.current?.focus();
  };

  const go = () => {
    if (!ok) return;
    onAdd({ name: name.trim(), pct: clampPct(Number(pct) || 0) });
    setName(""); setPct(""); setOpen(false); setActive(-1);
    nameRef.current?.focus();
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(list.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "Tab" && open && name.trim() && list.length) {
      e.preventDefault();
      pick(active >= 0 && list[active] ? list[active]! : list[0]!);
    } else if (e.key === "Enter") {
      if (open && active >= 0 && list[active]) pick(list[active]!);
      else go();
    }
  };

  return (
    <div className="grid grid-cols-[1fr_4.5rem_auto] gap-2">
      <div className="relative min-w-0">
        <input
          ref={nameRef}
          className="field w-full"
          placeholder="Travail — tapez m…"
          value={name}
          autoComplete="off"
          onChange={(e) => { setName(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
        {open && list.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-xl">
            {list.map((s, i) => (
              <li key={s}>
                <button type="button"
                  className={`w-full px-3 py-2 text-left text-sm ${i === active ? "bg-primary/15 font-semibold text-primary" : "hover:bg-secondary"}`}
                  onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input className="field min-w-0" type="number" inputMode="numeric" min={0} max={100} placeholder="%" value={pct}
        onChange={(e) => setPct(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button className="btn-primary" disabled={!ok} onClick={go}><Plus size={16} /></button>
    </div>
  );
}

function App() {
  const [data, setData] = useState<AppData>({ projects: [] });
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<Sel>(() => loadSel());
  const [viewer, setViewer] = useState<null | { pdf: boolean }>(null);
  const [flash, setFlash] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [ask, setAsk] = useState<null | { title: string; value?: string; danger?: boolean; ok: (v: string) => void }>(null);

  useEffect(() => { setData(load()); setReady(true); }, []);
  useEffect(() => {
    try { localStorage.setItem(SEL_KEY, JSON.stringify(sel)); } catch { /* ignore */ }
  }, [sel]);
  useEffect(() => {
    if (!ready) return;
    setSaved("saving");
    const t = setTimeout(() => { save(data); setSaved("saved"); }, 350);
    return () => clearTimeout(t);
  }, [data, ready]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 4000); return () => clearTimeout(t); }, [flash]);

  const mutate = (fn: (d: AppData) => void) => setData((d) => { const c = structuredClone(d); fn(c); return c; });

  const project = data.projects.find((x) => x.id === sel.p) ?? data.projects[0];
  const bloc = project?.blocs.find((x) => x.id === sel.b) ?? project?.blocs[0];
  const floor = bloc?.floors.find((x) => x.id === sel.f) ?? bloc?.floors[0];
  const apt = floor?.apts.find((x) => x.id === sel.a);

  // Sélection mémorisée mais appartement supprimé : on retombe sur le premier.
  useEffect(() => {
    if (!sel.a || apt || !floor) return;
    const first = floor.apts[0];
    if (first) setSel((s) => ({ ...s, f: floor.id, a: first.id }));
  }, [sel.a, apt, floor]);

  const P = (d: AppData) => d.projects.find((x) => x.id === project?.id)!;
  const B = (d: AppData) => P(d).blocs.find((x) => x.id === bloc?.id)!;
  const F = (d: AppData) => B(d).floors.find((x) => x.id === floor?.id)!;
  const A = (d: AppData) => F(d).apts.find((x) => x.id === apt?.id)!;
  const rename = (cur: string, fn: (v: string) => void) =>
    setAsk({ title: `Renommer « ${cur} »`, value: cur, ok: (v) => { const t = v.trim(); if (t && t !== cur) fn(t); } });
  const del = (what: string, fn: () => void) => setAsk({ title: `Supprimer ${what} ?`, danger: true, ok: () => fn() });
  const tools = (cur: string, onRename: (v: string) => void, onDel: () => void) => (
    <div className="flex gap-1">
      <button className="btn-ghost px-2" aria-label="Renommer" onClick={() => rename(cur, onRename)}><Pencil size={14} /></button>
      <button className="btn-ghost px-2" aria-label="Supprimer" onClick={() => del(cur, onDel)}><Trash2 size={14} /></button>
    </div>
  );

  const flatApts = bloc ? bloc.floors.flatMap((f) => f.apts.map((a) => ({ f: f.id, a: a.id }))) : [];
  const aptIndex = apt ? flatApts.findIndex((x) => x.a === apt.id) : -1;
  const goApt = (dir: 1 | -1) => {
    const next = flatApts[aptIndex + dir];
    if (next && project && bloc) setSel({ p: project.id, b: bloc.id, f: next.f, a: next.a });
  };

  const quick = (floors: number, aptsPerFloor: number, prefix: string) => {
    let added = { addedFloors: 0, addedApts: 0, addedCommons: 0 };
    mutate((d) => { added = applyGrid(B(d), floors, aptsPerFloor, prefix); });
    const parts = [
      added.addedFloors ? `${added.addedFloors} étage${added.addedFloors > 1 ? "s" : ""}` : "",
      added.addedApts ? `${added.addedApts} appartement${added.addedApts > 1 ? "s" : ""}` : "",
      added.addedCommons ? `${added.addedCommons} espace${added.addedCommons > 1 ? "s" : ""} commun${added.addedCommons > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    setFlash(parts.length ? `Ajouté : ${parts.join(" · ")}` : "Rien de nouveau : étages et appartements déjà présents");
  };

  const tasks = apt?.tasks ?? [];
  const known = useMemo(() => knownNames(data), [data]);
  const nextApt = floor ? nextAptName(floor.apts) : "A1";
  const isCommon = apt?.common === true;
  const nApts = bloc ? bloc.floors.reduce((s, f) => s + f.apts.filter((a) => !a.common).length, 0) : 0;
  const nCommon = bloc ? bloc.floors.reduce((s, f) => s + f.apts.filter((a) => a.common).length, 0) : 0;
  const patchTask = (id: string, p: Partial<Task>) => mutate((d) => {
    const x = A(d).tasks.find((y) => y.id === id);
    if (x) Object.assign(x, p);
  });

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-3 p-3 pb-16 font-sans">
      <header className="flex items-center justify-center gap-3 py-3">
        <Building2 className="text-primary" size={36} />
        <div><h1 className="text-3xl font-extrabold tracking-tight">BatiSuivi</h1><p className="text-sm text-muted-foreground">Suivi des travaux</p></div>
      </header>

      {apt && floor && bloc && project && (
        <div className="sticky top-0 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <button className="btn-ghost size-10 shrink-0 p-0" onClick={() => goApt(-1)} disabled={aptIndex <= 0} aria-label="Appartement précédent"><ChevronLeft size={18} /></button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-bold">
                {bloc.name} · étage {floor.label} · <span className="text-primary">{apt.name}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">{isCommon ? "Espace commun" : "Appartement"} {aptIndex + 1} / {flatApts.length}</div>
            </div>
            <button className="btn-ghost size-10 shrink-0 p-0" onClick={() => goApt(1)} disabled={aptIndex >= flatApts.length - 1} aria-label="Appartement suivant"><ChevronRight size={18} /></button>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {tasks.length ? `${tasks.length} ${tasks.length > 1 ? "travaux saisis" : "travail saisi"}` : "Aucun travail"}
            </span>
            <span className="flex-1" />
            <span className={`rounded-lg bg-secondary px-2.5 py-1 text-sm font-extrabold ${TXT[status(aptPct(apt))]}`}>{fmt(aptPct(apt))}</span>
            <span className="flex w-24 items-center justify-end gap-1 text-[11px] text-muted-foreground">
              {saved === "saved" ? <><Check size={12} className="text-success" /> Enregistré</> : "…"}
            </span>
          </div>
        </div>
      )}

      <Section icon={<Building2 size={20} />} title="Projet" right={project && tools(project.name, (v) => mutate((d) => { P(d).name = v; }), () => mutate((d) => { d.projects = d.projects.filter((x) => x.id !== project.id); }))}>
        {data.projects.length > 0 && (
          <select className="field w-full" value={project?.id} onChange={(e) => setSel({ p: e.target.value, b: "", f: "", a: "" })}>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <AddInline placeholder="Nouveau projet" onAdd={(name) => { const p: Project = { id: uid(), name, blocs: [] }; mutate((d) => { d.projects.push(p); }); setSel({ p: p.id, b: "", f: "", a: "" }); }} />
      </Section>

      {project && (
        <Section icon={<Building2 size={20} />} title={bloc ? `${bloc.name}${bloc.floors.length > 1 ? ` — R+${bloc.floors.length - 1}` : bloc.floors.length ? " — RDC" : ""}` : "Bloc"}
          right={bloc && tools(bloc.name, (v) => mutate((d) => { B(d).name = v; }), () => mutate((d) => { P(d).blocs = P(d).blocs.filter((x) => x.id !== bloc.id); }))}>
          {project.blocs.length > 0 && (
            <select className="field w-full" value={bloc?.id} onChange={(e) => setSel({ ...sel, p: project.id, b: e.target.value, f: "", a: "" })}>
              {project.blocs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <AddInline placeholder="Nouveau bloc (ex : Bloc 01)" onAdd={(name) => { const b: Bloc = { id: uid(), name, floors: [] }; mutate((d) => { P(d).blocs.push(b); }); setSel({ p: project.id, b: b.id, f: "", a: "" }); }} />

          {bloc && <GridBuilder key={bloc.id} bloc={bloc} onApply={quick} />}
          {flash && <p className="rounded-xl bg-primary/15 px-3 py-2 text-sm text-primary">{flash}</p>}

          {bloc && bloc.floors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-full bg-secondary px-3 py-1 text-sm">Taux bloc : <b className={TXT[status(blocPct(bloc))]}>{fmt(blocPct(bloc))}</b></span>
              <span className="rounded-full bg-secondary px-3 py-1 text-sm">
                {nApts} appartements{nCommon > 0 ? ` · ${nCommon} ${nCommon > 1 ? "communs" : "commun"}` : ""}
              </span>
              <span className="flex-1" />
              <button className="btn-primary" onClick={() => setViewer({ pdf: false })}><Box size={16} /> Générer 3D</button>
              <button className="btn-ghost" onClick={() => setViewer({ pdf: true })}><FileDown size={16} /> Générer PDF</button>
            </div>
          )}
        </Section>
      )}

      {bloc && (
        <Section icon={<Layers size={20} />} title="Étages" right={floor && tools(floor.label, (v) => mutate((d) => { F(d).label = v; }), () => mutate((d) => { B(d).floors = B(d).floors.filter((x) => x.id !== floor.id); }))}>
          {bloc.floors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {bloc.floors.map((f) => {
                const p = floorPct(f);
                return (
                  <button key={f.id} onClick={() => setSel({ ...sel, p: project!.id, b: bloc.id, f: f.id, a: "" })}
                    className={`btn min-w-14 ${f.id === floor?.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {f.label}{p !== null && <span className="text-xs font-normal opacity-80">{fmt(p)}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <AddInline placeholder="Nouvel étage (ex : RDC, 1, 2…)" onAdd={(label) => { const id = uid(); mutate((d) => { B(d).floors.push({ id, label, apts: [] }); }); setSel({ ...sel, p: project!.id, b: bloc.id, f: id, a: "" }); }} />
        </Section>
      )}

      {floor && (
        <Section icon={<Home size={20} />} title={`Appartements — étage ${floor.label}`}
          right={floorPct(floor) !== null && <span className="rounded-full bg-secondary px-3 py-1 text-sm">Taux étage : <b className={TXT[status(floorPct(floor))]}>{fmt(floorPct(floor))}</b></span>}>
          {floor.apts.some((a) => a.common) && (
            <div className="space-y-2">
              {floor.apts.filter((a) => a.common).map((a) => {
                const p = aptPct(a);
                return (
                  <button key={a.id} onClick={() => setSel({ ...sel, p: project!.id, b: bloc!.id, f: floor.id, a: a.id })}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 border-dashed border-white/40 p-3 text-left text-primary-foreground transition-transform active:scale-[0.99] ${BG[status(p)]} ${a.id === apt?.id ? "ring-2 ring-foreground" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 size={18} className="shrink-0" />
                      <span className="truncate text-lg font-extrabold">{a.name}</span>
                    </span>
                    <span className="text-sm font-semibold">{p !== null ? fmt(p) : ""}</span>
                  </button>
                );
              })}
            </div>
          )}
          {floor.apts.some((a) => !a.common) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {floor.apts.filter((a) => !a.common).map((a) => {
                const p = aptPct(a);
                return (
                  <button key={a.id} onClick={() => setSel({ ...sel, p: project!.id, b: bloc!.id, f: floor.id, a: a.id })}
                    className={`rounded-xl p-3 text-left text-primary-foreground transition-transform active:scale-[0.98] ${BG[status(p)]} ${a.id === apt?.id ? "ring-2 ring-foreground" : ""}`}>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xl font-extrabold">{a.name}</span>
                      <span className="text-sm font-semibold">{p !== null ? fmt(p) : ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => {
              const name = nextApt;
              const id = uid();
              mutate((d) => { F(d).apts.push({ id, name, tasks: [] }); });
              setSel({ ...sel, p: project!.id, b: bloc!.id, f: floor.id, a: id });
            }}><Plus size={16} /> {nextApt}</button>
            {!floor.apts.some((a) => a.common) && (
              <button className="btn-ghost flex-1" onClick={() => {
                const id = uid();
                mutate((d) => { F(d).apts.push({ id, name: COMMON_NAME, tasks: [], common: true }); });
                setSel({ ...sel, p: project!.id, b: bloc!.id, f: floor.id, a: id });
              }}><Building2 size={16} /> {COMMON_NAME}</button>
            )}
          </div>
          <AddInline placeholder="Nom personnalisé (ex : A1 bis)" onAdd={(name) => { const id = uid(); mutate((d) => { F(d).apts.push({ id, name, tasks: [] }); }); setSel({ ...sel, p: project!.id, b: bloc!.id, f: floor.id, a: id }); }} />
        </Section>
      )}

      {apt && floor && bloc && (
        <Section icon={<Home size={20} />} title={`${bloc.name} — Étage ${floor.label} — ${apt.name}`}
          right={tools(apt.name, (v) => mutate((d) => { A(d).name = v; }), () => mutate((d) => { F(d).apts = F(d).apts.filter((x) => x.id !== apt.id); }))}>
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Saisissez le travail puis le % — tapez la première lettre pour voir les suggestions.</p>
          )}
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t}
              onPatch={(p) => patchTask(t.id, p)}
              onDelete={() => mutate((d) => { A(d).tasks = A(d).tasks.filter((y) => y.id !== t.id); })} />
          ))}
          <TaskForm known={known} onAdd={(t) => mutate((d) => { A(d).tasks.push({ ...t, id: uid() }); })} />
          {aptPct(apt) !== null && (
            <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
              <div className="font-bold">{isCommon ? "Taux espace commun" : "Taux appartement"}</div>
              <span className={`text-4xl font-extrabold ${TXT[status(aptPct(apt))]}`}>{fmt(aptPct(apt))}</span>
            </div>
          )}
        </Section>
      )}

      {viewer && project && bloc && <Viewer project={project} bloc={bloc} autoPdf={viewer.pdf} onClose={() => setViewer(null)} />}

      {ask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setAsk(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">{ask.title}</h3>
            {ask.value !== undefined && (
              <input autoFocus className="field w-full" value={ask.value}
                onChange={(e) => setAsk((a) => (a ? { ...a, value: e.target.value } : a))}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAsk(null);
                  if (e.key === "Enter" && ask.value?.trim()) { ask.ok(ask.value); setAsk(null); }
                }} />
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setAsk(null)}>Annuler</button>
              <button className="btn-primary" disabled={ask.value !== undefined && !ask.value.trim()}
                onClick={() => { ask.ok(ask.value ?? ""); setAsk(null); }}>
                {ask.danger ? "Supprimer" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Viewer({ project, bloc, autoPdf, onClose }: { project: Project; bloc: Bloc; autoPdf: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>({ type: "all" });
  const [angle, setAngle] = useState<Angle>("iso");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const snap = async () => {
    for (let i = 0; i < 15; i++) {
      const c = box.current?.querySelector("canvas");
      if (c && c.width > 0) {
        const url = c.toDataURL("image/png");
        if (url.length > 500) return { url, aspect: c.width / Math.max(1, c.height) };
      }
      await wait(120);
    }
    return { url: "", aspect: 1.6 };
  };

  const makePdf = async () => {
    setBusy(true);
    const prevView = view;
    const prevAngle = angle;
    setView({ type: "all" });
    try {
      const shots: Shot[] = [];
      for (const [i, s] of SHOTS.entries()) {
        setStep(`${i + 1}/${SHOTS.length}`);
        let cap = { url: "", aspect: 1.6 };
        for (let attempt = 0; attempt < 2 && !cap.url; attempt++) {
          setAngle(s.angle);
          await wait(attempt === 0 ? (i === 0 ? 650 : 380) : 500);
          cap = await snap();
        }
        shots.push({ url: cap.url, aspect: cap.aspect, label: s.label });
      }
      buildPdf(project, bloc, shots);
    } finally {
      setAngle(prevAngle);
      setView(prevView);
      setBusy(false);
      setStep("");
    }
  };

  useEffect(() => {
    if (autoPdf && !started.current) {
      started.current = true;
      void (async () => { await wait(500); await makePdf(); })();
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <h2 className="min-w-0 flex-1 truncate font-bold">{bloc.name} — 3D</h2>
        <button className="btn-primary" disabled={busy} onClick={makePdf}><FileDown size={16} /> {busy ? `PDF ${step}` : "PDF"}</button>
        <button className="btn-ghost px-2" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="flex gap-2 overflow-x-auto p-2 pb-0">
        <button disabled={busy} onClick={() => setView({ type: "all" })} className={`btn whitespace-nowrap ${view.type === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Bâtiment</button>
        {bloc.floors.map((f, i) => (
          <button key={f.id} disabled={busy} onClick={() => setView({ type: "floor", idx: i })}
            className={`btn whitespace-nowrap ${view.type === "floor" && view.idx === i ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Étage {f.label}{floorPct(f) !== null && ` · ${fmt(floorPct(f))}`}</button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto px-2 pb-2">
        {SHOTS.map((s) => (
          <button key={s.angle} disabled={busy} onClick={() => setAngle(s.angle)}
            className={`btn h-8 whitespace-nowrap text-xs ${angle === s.angle ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{s.label}</button>
        ))}
      </div>

      <div ref={box} className="relative flex-1">
        <Suspense fallback={<p className="p-6 text-muted-foreground">Chargement 3D…</p>}>
          <Building3D bloc={bloc} view={view} angle={angle} />
        </Suspense>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl bg-card/90 p-2 text-xs">
          {(["done", "doing", "todo"] as const).map((s) => <span key={s} className="flex items-center gap-1"><i className={`inline-block size-3 rounded ${BG[s]}`} />{LEGEND[s]}</span>)}
        </div>
      </div>
    </div>
  );
}
