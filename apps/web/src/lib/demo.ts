import { db, getMeta, setMeta } from "./db";
import type {
  Client,
  Expense,
  Farm,
  Finding,
  FindingKind,
  Operation,
  OperationKind,
  OperationStatus,
  Plot,
  Rainfall,
  Sale,
  Season,
  StockMove,
  StockMoveKind,
  Supply,
  SupplyCategory,
  Visit,
  ExpenseCategory,
} from "./db";
import { seasonLabelFor } from "./season";

/**
 * Fazenda de exemplo para demonstração: duas fazendas no sul do Maranhão, seis talhões,
 * safra atual em andamento e a passada já colhida. As datas são relativas a hoje.
 * Todo id começa com `demo-`, para o exemplo poder ser apagado sem tocar no resto.
 */

export const DEMO_PREFIX = "demo-";
const DEMO_KEY = "demoLoaded";

export type DemoData = {
  clients: Client[];
  farms: Farm[];
  plots: Plot[];
  seasons: Season[];
  visits: Visit[];
  findings: Finding[];
  rainfall: Rainfall[];
  operations: Operation[];
  supplies: Supply[];
  stockMoves: StockMove[];
  sales: Sale[];
  expenses: Expense[];
};

const TABLES = [
  "clients",
  "farms",
  "plots",
  "seasons",
  "visits",
  "findings",
  "rainfall",
  "operations",
  "supplies",
  "stockMoves",
  "sales",
  "expenses",
] as const satisfies readonly (keyof DemoData)[];

/** Campos que apontam para outro registro: o que o usuário criou dentro do exemplo sai junto. */
const REFS = ["clientId", "farmId", "plotId", "seasonId", "visitId", "supplyId", "operationId"] as const;

const KM_LNG = 110.3;
const KM_LAT = 110.57;

/** Contorno em km locais (x leste, y norte) para [lng, lat], com a área em ha igual à do desenho. */
function shape(lng0: number, lat0: number, pts: [number, number][]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  const ring = pts.map(([x, y]) => [+(lng0 + x / KM_LNG).toFixed(6), +(lat0 + y / KM_LAT).toFixed(6)] as [number, number]);
  ring.push(ring[0]);
  return { boundary: ring, areaHa: Math.round(Math.abs(a / 2) * 1000) / 10 };
}

export function buildDemo(now: number = Date.now()): DemoData {
  let seq = 0;
  const base = (id: string) => ({ id: DEMO_PREFIX + id, createdAt: now - 1000 * ++seq, updatedAt: now - 1000 * seq });
  const ref = (id: string) => DEMO_PREFIX + id;
  const day = (offset: number) => {
    const d = new Date(now + offset * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const current = seasonLabelFor(new Date(now));
  const startYear = Number(current.slice(0, 4)) - 1;
  const past = `${startYear}/${String(startYear + 1).slice(2)}`;

  const LAT0 = -7.53;
  const SL = -46.04;
  const BE = -45.93;
  const plotsDef: [string, string, string, ReturnType<typeof shape>][] = [
    ["p1", "f1", "Talhão 1 - Baixada", shape(SL, LAT0, [[0, 0], [3.4, 0.25], [3.7, -2.9], [0.35, -3.3], [-0.15, -1.6]])],
    ["p2", "f1", "Talhão 2 - Chapada", shape(SL, LAT0, [[3.4, 0.25], [5.9, 0.55], [6.15, -2.5], [3.7, -2.9]])],
    ["p3", "f1", "Talhão 3 - Sede", shape(SL, LAT0, [[0.35, -3.3], [3.7, -2.9], [3.85, -4.4], [2.1, -4.9], [0.6, -4.75]])],
    ["p4", "f1", "Talhão 4 - Cabeceira", shape(SL, LAT0, [[3.7, -2.9], [6.15, -2.5], [5.95, -4.0], [3.85, -4.4]])],
    ["p5", "f2", "Talhão Norte", shape(BE, LAT0 - 0.02, [[0, 0], [2.1, 0.3], [2.3, -1.5], [0.1, -1.8]])],
    ["p6", "f2", "Talhão Sul", shape(BE, LAT0 - 0.02, [[0.1, -1.8], [2.3, -1.5], [2.15, -2.9], [0.9, -3.15], [0.25, -2.8]])],
  ];
  const plots: Plot[] = plotsDef.map(([id, farmId, name, s]) => ({
    ...base(id),
    farmId: ref(farmId),
    name,
    areaHa: s.areaHa,
    boundary: s.boundary,
  }));
  const area = Object.fromEntries(plotsDef.map(([id, , , s]) => [id, s.areaHa]));
  const farmOf = Object.fromEntries(plotsDef.map(([id, farmId]) => [id, farmId]));

  const cultivars: Record<string, string> = {
    p1: "TMG 2383 IPRO",
    p2: "BRS 8383 IPRO",
    p3: "NEO 790 IPRO",
    p4: "TMG 2383 IPRO",
    p5: "M 8644 IPRO",
    p6: "BMX Bônus IPRO",
  };
  const planted: Record<string, number> = { p1: -24, p2: -19, p3: -15, p4: -12, p5: -21, p6: -9 };

  const seasons: Season[] = [];
  for (const [id] of plotsDef) {
    seasons.push({ ...base(`s-${id}`), plotId: ref(id), label: current, cultivar: cultivars[id], plantingDate: day(planted[id]) });
    seasons.push({ ...base(`o-${id}`), plotId: ref(id), label: past, cultivar: cultivars[id], plantingDate: day(planted[id] - 362) });
  }

  const visits: Visit[] = [];
  const findings: Finding[] = [];
  function visit(
    id: string,
    plotId: string,
    offset: number,
    stage: string,
    observations: string,
    recommendation: string,
    followUp: number | null,
    found: [FindingKind, string, string][] = [],
    seasonPrefix = "s",
  ) {
    visits.push({
      ...base(id),
      farmId: ref(farmOf[plotId]),
      plotId: ref(plotId),
      seasonId: ref(`${seasonPrefix}-${plotId}`),
      date: day(offset),
      stage,
      observations,
      recommendation,
      followUpDate: followUp == null ? null : day(followUp),
      followUpDone: followUp != null && followUp < -1,
    });
    found.forEach(([kind, name, amount], i) =>
      findings.push({ ...base(`${id}-f${i}`), visitId: ref(id), kind, name, amount, note: "" }),
    );
  }
  visit("v1", "p1", -16, "VE", "Emergência uniforme, estande de 13 plantas/m.", "", null);
  visit("v2", "p1", -9, "V2", "Boa sanidade. Início de buva na bordadura leste.", "Planejar controle de buva antes do fechamento.", -4, [
    ["daninha", "Buva", "manchas na bordadura"],
  ]);
  visit("v3", "p1", -2, "V4", "Lavoura uniforme. Lagarta na bordadura sul, abaixo do nível de controle.", "Monitorar bordadura em 5 dias.", 3, [
    ["praga", "Lagarta-falsa-medideira", "3 por pano"],
    ["daninha", "Buva", "manchas"],
  ]);
  visit("v4", "p2", -12, "VE", "Emergência boa na parte baixa.", "", null);
  visit("v5", "p2", -6, "V2", "Falhas de estande na parte alta, solo compactado.", "Avaliar replantio na faixa alta.", -1, [
    ["doenca", "Tombamento", "pontual"],
  ]);
  visit("v6", "p3", -5, "VC", "Emergência regular, umidade boa.", "", 4);
  visit("v7", "p4", -3, "VE", "Emergência em andamento.", "", null, [["praga", "Vaquinha", "1 por metro"]]);
  visit("v8", "p5", -14, "VE", "Emergência boa.", "", null);
  visit("v9", "p5", -1, "V3", "Percevejo-castanho em reboleira no centro do talhão.", "Mapear reboleira e retornar em 3 dias.", 2, [
    ["praga", "Percevejo-castanho", "reboleira"],
  ]);
  visit("v10", "p6", -2, "VE", "Emergência iniciando após chuva de 18 mm.", "", 6);
  // Safra passada
  visit("ov1", "p1", -330, "V6", "Lagarta-da-soja acima do nível na parte baixa.", "Aplicar inseticida na área toda.", null, [["praga", "Lagarta-da-soja", "8 por pano"]], "o");
  visit("ov2", "p1", -300, "R2", "Primeiras pústulas de ferrugem no terço inferior.", "Antecipar fungicida.", null, [["doenca", "Ferrugem-asiática", "baixa incidência"]], "o");
  visit("ov3", "p2", -310, "R1", "Percevejo-marrom chegando pela bordadura.", "Monitorar a cada 4 dias.", null, [["praga", "Percevejo-marrom", "1 por pano"]], "o");
  visit("ov4", "p3", -290, "R3", "Mancha-alvo no baixeiro.", "", null, [["doenca", "Mancha-alvo", "moderada"]], "o");
  visit("ov5", "p5", -305, "R2", "Percevejo-marrom no nível de controle.", "Aplicar na área toda.", null, [["praga", "Percevejo-marrom", "2 por pano"]], "o");
  visit("ov6", "p6", -280, "R5", "Lavoura boa, enchimento de grão uniforme.", "", null, [], "o");

  const rainfall: Rainfall[] = (
    [
      ["f1", -38, 18], ["f1", -31, 26.5], ["f1", -26, 34], ["f1", -17, 12], ["f1", -11, 41], ["f1", -6, 8.5], ["f1", -3, 22.5],
      ["f2", -29, 21], ["f2", -20, 30], ["f2", -10, 15.5], ["f2", -4, 18],
    ] as [string, number, number][]
  ).map(([farmId, off, mm], i) => ({ ...base(`r${i}`), farmId: ref(farmId), date: day(off), mm }));

  const operations: Operation[] = [];
  function op(
    id: string,
    plotId: string,
    kind: OperationKind,
    status: OperationStatus,
    offset: number,
    description: string,
    costPerHa: number | null,
    extra: { seasonId?: string; yieldBags?: number } = {},
  ) {
    const a = area[plotId];
    operations.push({
      ...base(id),
      farmId: ref(farmOf[plotId]),
      plotId: ref(plotId),
      seasonId: ref(extra.seasonId ?? `s-${plotId}`),
      kind,
      status,
      date: day(offset),
      doneDate: status === "concluida" ? day(offset + Math.max(1, Math.round(a / 400))) : null,
      areaHa: a,
      description,
      cost: costPerHa == null ? null : Math.round(costPerHa * a),
      yieldBags: extra.yieldBags ?? null,
    });
  }
  for (const [id] of plotsDef) {
    op(`des-${id}`, id, "aplicacao", "concluida", planted[id] - 12, "Dessecação pré-plantio", 145);
    op(`pla-${id}`, id, "plantio", "concluida", planted[id], `Plantio ${cultivars[id]}`, 1380);
  }
  op("adu-p1", "p1", "adubacao", "concluida", -8, "Cobertura KCl 100 kg/ha", 310);
  op("adu-p2", "p2", "adubacao", "andamento", -1, "Cobertura KCl 100 kg/ha", 310);
  op("apl-p1", "p1", "aplicacao", "planejada", 2, "Inseticida para lagarta", null);
  op("apl-p5", "p5", "aplicacao", "planejada", 1, "Inseticida para percevejo-castanho (reboleira)", null);
  op("her-p2", "p2", "aplicacao", "planejada", 5, "Herbicida pós-emergente", null);
  op("adu-p3", "p3", "adubacao", "planejada", -2, "Cobertura KCl 100 kg/ha", null);
  const yields: Record<string, number> = { p1: 68.4, p2: 61.2, p3: 64.8, p4: 58.9, p5: 63.5, p6: 57.1 };
  for (const [id] of plotsDef) {
    const s = { seasonId: `o-${id}` };
    op(`old-pla-${id}`, id, "plantio", "concluida", planted[id] - 362, `Plantio ${cultivars[id]}`, 1290, s);
    op(`old-trat-${id}`, id, "aplicacao", "concluida", planted[id] - 310, "Fungicida + inseticida (3 aplicações)", 640, s);
    op(`old-col-${id}`, id, "colheita", "concluida", planted[id] - 245, "Colheita", 180, {
      ...s,
      yieldBags: Math.round(yields[id] * area[id]),
    });
  }

  const supplies: Supply[] = (
    [
      ["i1", "Semente TMG 2383 IPRO", "semente", "sc", 40],
      ["i2", "Cloreto de potássio", "fertilizante", "t", 20],
      ["i3", "Glifosato 480", "herbicida", "L", 400],
      ["i4", "Inseticida diamida", "inseticida", "L", 50],
      ["i5", "Fungicida carboxamida", "fungicida", "L", 80],
      ["i6", "Óleo diesel", "combustivel", "L", 3000],
    ] as [string, string, SupplyCategory, string, number][]
  ).map(([id, name, category, unit, minQty]) => ({ ...base(id), name, category, unit, minQty, notes: "" }));

  const stockMoves: StockMove[] = (
    [
      ["m1", "i1", "entrada", 900, -45, 405000, null, "NF 4521 - Agro Balsas"],
      ["m2", "i1", "uso", 410, -24, null, "pla-p1", ""],
      ["m3", "i1", "uso", 300, -12, null, "pla-p4", ""],
      ["m4", "i2", "entrada", 220, -30, 660000, null, "NF 889 - Fertilizantes MA"],
      ["m5", "i2", "uso", 128, -8, null, "adu-p1", ""],
      ["m6", "i3", "entrada", 2400, -50, 62400, null, "NF 3310"],
      ["m7", "i3", "ajuste", -2120, -36, null, null, "Usado na dessecação"],
      ["m8", "i4", "entrada", 35, -20, 31500, null, ""],
      ["m9", "i5", "entrada", 300, -15, 96000, null, "Compra antecipada"],
      ["m10", "i6", "entrada", 12000, -40, 74400, null, ""],
      ["m11", "i6", "ajuste", -9800, -10, null, null, "Consumo no plantio e pulverização"],
    ] as [string, string, StockMoveKind, number, number, number | null, string | null, string][]
  ).map(([id, supplyId, kind, qty, off, cost, operationId, note]) => ({
    ...base(id),
    supplyId: ref(supplyId),
    kind,
    qty,
    date: day(off),
    cost,
    operationId: operationId ? ref(operationId) : null,
    note,
  }));

  const sales: Sale[] = (
    [
      ["sa1", past, -215, 90000, 121.4, "Cargill Balsas", "f1"],
      ["sa2", past, -170, 70000, 126.8, "Bunge Uruçuí", "f1"],
      ["sa3", past, -160, 38000, 124.0, "Cargill Balsas", "f2"],
      ["sa4", current, -5, 40000, 128.5, "Cargill Balsas", "f1"],
    ] as [string, string, number, number, number, string, string][]
  ).map(([id, seasonLabel, off, bags, pricePerBag, buyer, farmId]) => ({
    ...base(id),
    seasonLabel,
    date: day(off),
    bags,
    pricePerBag,
    buyer,
    note: seasonLabel === current ? "Venda antecipada" : "",
    farmId: ref(farmId),
  }));

  const expenses: Expense[] = (
    [
      ["e1", past, -330, "arrendamento", "Arrendamento área chapada", 1150000, "f1"],
      ["e2", past, -250, "mao_de_obra", "Folha da safra", 520000, "f1"],
      ["e3", past, -230, "frete", "Frete até o armazém", 310000, "f1"],
      ["e4", past, -230, "mao_de_obra", "Folha da safra", 160000, "f2"],
      ["e5", current, -25, "arrendamento", "Arrendamento área chapada", 1200000, "f1"],
      ["e6", current, -8, "mao_de_obra", "Folha do mês", 86000, "f1"],
      ["e7", current, -6, "manutencao", "Revisão da plantadeira", 38500, "f1"],
      ["e8", current, -4, "assistencia", "Consultoria agronômica", 15000, null],
    ] as [string, string, number, ExpenseCategory, string, number, string | null][]
  ).map(([id, seasonLabel, off, category, description, amount, farmId]) => ({
    ...base(id),
    seasonLabel,
    date: day(off),
    category,
    description,
    amount,
    farmId: farmId ? ref(farmId) : null,
  }));

  return {
    clients: [
      { ...base("c1"), name: "João Ribeiro", phone: "(99) 98877-1020", municipality: "Balsas - MA", notes: "" },
      { ...base("c2"), name: "Maria Alves", phone: "(99) 99102-3344", municipality: "Tasso Fragoso - MA", notes: "" },
    ],
    farms: [
      { ...base("f1"), name: "Fazenda Santa Luzia", municipality: "Balsas - MA", owner: "João Ribeiro", clientId: ref("c1") },
      { ...base("f2"), name: "Sítio Boa Esperança", municipality: "Tasso Fragoso - MA", owner: "Maria Alves", clientId: ref("c2") },
    ],
    plots,
    seasons,
    visits,
    findings,
    rainfall,
    operations,
    supplies,
    stockMoves,
    sales,
    expenses,
  };
}

/** Grava o exemplo. Pode rodar de novo: os mesmos ids são sobrescritos com datas de hoje. */
export async function loadDemo(now: number = Date.now()) {
  const data = buildDemo(now);
  await db.transaction("rw", [...TABLES.map((t) => db.table(t)), db.meta], async () => {
    for (const t of TABLES) await db.table(t).bulkPut(data[t]);
    await setMeta(DEMO_KEY, true);
  });
}

const isDemo = (v: unknown) => typeof v === "string" && v.startsWith(DEMO_PREFIX);

/** Registro do exemplo ou criado dentro dele (visita num talhão de exemplo): nunca vai para a nuvem. */
export function isDemoRow(r: Record<string, unknown>): boolean {
  return isDemo(r.id) || REFS.some((k) => isDemo(r[k]));
}

/**
 * Apaga o exemplo de verdade (não é exclusão lógica: nunca foi dado do produtor),
 * junto com o que foi criado dentro dele, como uma visita nova num talhão de exemplo.
 */
export async function removeDemo() {
  await db.transaction("rw", [...TABLES.map((t) => db.table(t)), db.photos, db.meta], async () => {
    for (const t of [...TABLES, "photos"] as const) {
      await db
        .table(t)
        .filter(isDemoRow)
        .delete();
    }
    // Fotos e achados de visitas novas que caíram junto com a visita.
    const visitIds = new Set((await db.visits.toCollection().primaryKeys()) as string[]);
    await db.findings.filter((f) => !visitIds.has(f.visitId)).delete();
    await db.photos.filter((p) => !visitIds.has(p.visitId)).delete();
    await db.meta.delete(DEMO_KEY);
  });
}

export async function demoLoaded(): Promise<boolean> {
  return (await getMeta<boolean>(DEMO_KEY)) === true;
}
