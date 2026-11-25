import { describe, it, expect } from "vitest";
import {
  applyGrid,
  aptPct,
  blocPct,
  floorPct,
  nextAptName,
  normalize,
  normalizeName,
  suggestNames,
  workSummary,
  type Apt,
  type Bloc,
  type Task,
} from "./batiment";

const task = (id: string, pct: number, name = "t"): Task => ({ id, name, pct });
const apt = (id: string, tasks: Task[]): Apt => ({ id, name: id, tasks });

describe("taux", () => {
  it("appartement = moyenne simple des travaux", () => {
    expect(aptPct(apt("a", [task("1", 50), task("2", 100)]))).toBeCloseTo(75);
    expect(aptPct(apt("a", [task("1", 0), task("2", 100)]))).toBe(50);
  });

  it("appartement sans tâche n'a pas de taux", () => {
    expect(aptPct(apt("a", []))).toBeNull();
  });

  it("étage ignore les appartements vides", () => {
    expect(floorPct({ id: "f", label: "1", apts: [apt("a", [task("1", 50)]), apt("b", [])] })).toBe(50);
  });

  it("bloc = moyenne des étages saisis", () => {
    const bloc: Bloc = {
      id: "b",
      name: "B",
      floors: [
        { id: "f0", label: "RDC", apts: [apt("a", [task("1", 100)])] },
        { id: "f1", label: "1", apts: [apt("b", [task("1", 0)])] },
      ],
    };
    expect(blocPct(bloc)).toBeCloseTo(50);
  });

  it("bloc : les étages sans saisie ne comptent pas", () => {
    const bloc: Bloc = {
      id: "b",
      name: "B",
      floors: [
        { id: "f0", label: "RDC", apts: [apt("a", [task("1", 100)])] },
        { id: "f1", label: "1", apts: [apt("b", [task("1", 50)])] },
        { id: "f2", label: "2", apts: [apt("c", [])] },
      ],
    };
    expect(blocPct(bloc)).toBeCloseTo(75);
  });
});

describe("génération rapide", () => {
  it("crée RDC + n étages avec leurs appartements et un espace commun, puis ne double rien", () => {
    const bloc: Bloc = { id: "b", name: "B", floors: [] };
    expect(applyGrid(bloc, 10, 4)).toEqual({ addedFloors: 10, addedApts: 40, addedCommons: 10 });
    expect(bloc.floors.map((f) => f.label)).toEqual(["RDC", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(bloc.floors[0]?.apts.filter((a) => !a.common).map((a) => a.name)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(bloc.floors[0]?.apts.filter((a) => a.common)).toHaveLength(1);
    expect(applyGrid(bloc, 10, 4)).toEqual({ addedFloors: 0, addedApts: 0, addedCommons: 0 });
    expect(applyGrid(bloc, 12, 5, "B")).toEqual({ addedFloors: 2, addedApts: 20, addedCommons: 2 });
    expect(bloc.floors[11]?.label).toBe("11");
    expect(bloc.floors[0]?.apts.filter((a) => !a.common).map((a) => a.name)).toEqual(["A1", "A2", "A3", "A4", "B5"]);
  });

  it("propose le nom suivant dans la même série (F1…F4 → F5)", () => {
    expect(nextAptName([{ id: "1", name: "F1", tasks: [] }, { id: "2", name: "F4", tasks: [] }])).toBe("F5");
    expect(nextAptName([{ id: "1", name: "A2", tasks: [] }])).toBe("A3");
    expect(nextAptName([])).toBe("A1");
  });
});

describe("suggestions de travaux", () => {
  it("propose un travail dès la première lettre, sans accents", () => {
    const names = suggestNames("m", []).map(normalizeName);
    expect(names).toContain("maconnerie");
    expect(normalizeName(suggestNames("maco", [])[0] ?? "")).toBe("maconnerie");
  });

  it("privilégie les noms déjà saisis sur le chantier", () => {
    const known = [{ name: "Enduit extérieur", count: 12 }];
    expect(suggestNames("end", known)[0]).toBe("Enduit extérieur");
  });

  it("ignore la casse et les accents de la saisie", () => {
    expect(suggestNames("MAÇON", [])[0]).toBe("Maçonnerie");
  });
});

describe("travaux saisis (PDF)", () => {
  it("garde les tâches nommées (même à 0%) et les regroupe par nom", () => {
    const bloc: Bloc = {
      id: "b",
      name: "B",
      floors: [
        { id: "f0", label: "RDC", apts: [apt("a", [task("1", 50, "Peinture"), task("2", 0, "Vide"), task("3", 0, " ")])] },
        { id: "f1", label: "1", apts: [apt("b", [task("4", 100, "Peinture")])] },
      ],
    };
    const rows = workSummary(bloc);
    expect(rows.map((r) => r.name)).toEqual(["Peinture", "Vide"]);
    const peinture = rows[0]!;
    expect(peinture.count).toBe(2);
    expect(peinture.pct).toBeCloseTo(75);
    expect(rows[1]?.pct).toBe(0);
  });
});

describe("migration des anciens formats", () => {
  it("convertit fait/total en % et ignore surface + lot", () => {
    const data = normalize({
      projects: [
        {
          id: "p",
          name: "P",
          blocs: [
            {
              id: "b",
              name: "B",
              floors: [{ id: "f", label: "RDC", apts: [{ id: "a", name: "A1", tasks: [{ id: "t", name: "Enduit", cat: "CE", done: 30, total: 120, unit: "m²" }] }] }],
            },
          ],
        },
      ],
    });
    const t = data.projects[0]?.blocs[0]?.floors[0]?.apts[0]?.tasks[0];
    expect(t).toEqual({ id: "t", name: "Enduit", pct: 25 });
    expect(data.projects[0]?.blocs[0]?.floors[0]?.apts[0]?.name).toBe("A1");
  });

  it("conserve le drapeau espace commun", () => {
    const data = normalize({
      projects: [
        {
          id: "p",
          name: "P",
          blocs: [
            {
              id: "b",
              name: "B",
              floors: [
                {
                  id: "f",
                  label: "RDC",
                  apts: [
                    { id: "a", name: "A1", tasks: [] },
                    { id: "c", name: "Espace commun", common: true, tasks: [{ id: "t", name: "Peinture", pct: 100 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const apts = data.projects[0]?.blocs[0]?.floors[0]?.apts ?? [];
    expect(apts[1]?.common).toBe(true);
    expect(apts[1]?.tasks[0]?.pct).toBe(100);
  });
});
