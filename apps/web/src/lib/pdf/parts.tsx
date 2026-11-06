import { Circle, Image as PdfImage, Line, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { FindingKind } from "../db";
import type { FarmDrawing } from "./season-model";
import type { InfoCell, MapDrawing } from "./visit-model";

/**
 * Peças do PDF com o visual do app (verde da marca, cartões claros). As fontes são as embutidas
 * do PDF (Helvetica): funcionam sem internet e têm todos os acentos do português.
 */

export const C = {
  brand: "#1c6b41",
  brandDark: "#0f2b1c",
  brandSoft: "#e8f3ec",
  ink: "#14231a",
  muted: "#5f6f66",
  line: "#dfe6e1",
  paper: "#ffffff",
  warnSoft: "#fff7e6",
  warn: "#92400e",
};

export const FINDING_COLOR: Record<FindingKind, { bg: string; fg: string }> = {
  praga: { bg: "#fef3c7", fg: "#92400e" },
  doenca: { bg: "#fee2e2", fg: "#991b1b" },
  daninha: { bg: "#dcfce7", fg: "#166534" },
  outro: { bg: "#e5e7eb", fg: "#374151" },
};

export const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink, backgroundColor: C.paper },
  band: { backgroundColor: C.brandDark, borderRadius: 10, padding: 16, color: "#fff", flexDirection: "row", alignItems: "center", gap: 14 },
  logoBox: { width: 54, height: 54, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 50, height: 50, objectFit: "contain" },
  eyebrow: { fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: "#a7c9b4" },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 3 },
  sub: { fontSize: 10, color: "#d5e6db", marginTop: 3 },
  section: { marginTop: 14 },
  h2: { fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase", color: C.brand, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cell: { width: "31.8%", backgroundColor: C.brandSoft, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8 },
  cellLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  cellValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  body: { fontSize: 10, lineHeight: 1.45 },
  muted: { color: C.muted },
  tag: { fontSize: 7.5, fontFamily: "Helvetica-Bold", borderRadius: 4, paddingVertical: 2, paddingHorizontal: 5 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 5, alignItems: "center" },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.muted, textTransform: "uppercase" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
});

/** Marca do AgroNexus (broto) quando a pessoa não pôs a logo dela. */
export function Sprout({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 20h10" stroke={C.brand} strokeWidth={2} />
      <Path d="M10 20c5.5-2.5.8-6.4 3-10" stroke={C.brand} strokeWidth={2} />
      <Path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" stroke={C.brand} strokeWidth={2} />
      <Path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" stroke={C.brand} strokeWidth={2} />
    </Svg>
  );
}

export function Header({
  logo,
  eyebrow,
  title,
  sub,
  right,
  rightLabel = "Data",
}: {
  logo?: string;
  eyebrow: string;
  title: string;
  sub: string;
  right?: string;
  rightLabel?: string;
}) {
  return (
    <View style={s.band}>
      <View style={s.logoBox}>{logo ? <PdfImage src={logo} style={s.logo} /> : <Sprout />}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      {right ? (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.eyebrow}>{rightLabel}</Text>
          <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 }}>{right}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** `keepWithNext`: espaço mínimo (pt) que precisa sobrar abaixo do título; senão ele desce para a página seguinte. */
export function Section({ title, children, wrap = true, keepWithNext = 40 }: { title: string; children: ReactNode; wrap?: boolean; keepWithNext?: number }) {
  return (
    <View style={s.section} wrap={wrap}>
      <Text style={s.h2} minPresenceAhead={keepWithNext}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function InfoGrid({ cells }: { cells: InfoCell[] }) {
  return (
    <View style={s.grid}>
      {cells.map((c) => (
        <View key={c.label} style={s.cell}>
          <Text style={s.cellLabel}>{c.label}</Text>
          <Text style={s.cellValue}>{c.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Table({ header, rows, widths }: { header: string[]; rows: string[][]; widths?: number[] }) {
  const w = (i: number) => ({ flex: widths?.[i] ?? 1 });
  return (
    <View>
      <View style={[s.tr, { paddingTop: 0 }]}>
        {header.map((h, i) => (
          <Text key={h} style={[s.th, w(i)]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, j) => (
        <View key={j} style={s.tr} wrap={false}>
          {r.map((c, i) => (
            <Text key={i} style={w(i)}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Contorno do talhão com os pontos marcados, norte e barra de escala. */
export function PlotMap({ map }: { map: MapDrawing }) {
  const { width: W, height: H } = map;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={map.path} fill="#cfe6d7" stroke={C.brand} strokeWidth={1.6} />
      {map.stand.map((p, i) => (
        <Circle key={`s${i}`} cx={p.x} cy={p.y} r={2.2} fill={C.brandDark} />
      ))}
      {map.points.map((p, i) => (
        <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3.6} fill={p.color} stroke="#fff" strokeWidth={1} />
      ))}
      <NorthAndScale W={W} H={H} scale={map.scale} />
    </Svg>
  );
}

/** Norte e barra de escala, comuns aos desenhos. */
function NorthAndScale({ W, H, scale }: { W: number; H: number; scale: { px: number; label: string } }) {
  return (
    <>
      <Path d={`M${W - 14} 6 L${W - 9} 20 L${W - 14} 17 L${W - 19} 20 Z`} fill={C.ink} />
      <Text x={W - 17} y={30} style={{ fontSize: 7, fontFamily: "Helvetica-Bold" }}>
        N
      </Text>
      <Line x1={8} y1={H - 8} x2={8 + scale.px} y2={H - 8} stroke={C.ink} strokeWidth={1.5} />
      <Line x1={8} y1={H - 11} x2={8} y2={H - 5} stroke={C.ink} strokeWidth={1} />
      <Line x1={8 + scale.px} y1={H - 11} x2={8 + scale.px} y2={H - 5} stroke={C.ink} strokeWidth={1} />
      <Text x={8} y={H - 13} style={{ fontSize: 6.5 }}>
        {scale.label}
      </Text>
    </>
  );
}

/** Todos os talhões da safra num desenho, com o nome de cada um. */
export function FarmMap({ map }: { map: FarmDrawing }) {
  const { width: W, height: H } = map;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {map.shapes.map((sh, i) => (
        <Path key={`p${i}`} d={sh.path} fill="#cfe6d7" stroke={C.brand} strokeWidth={1.4} />
      ))}
      {map.shapes.map((sh, i) => (
        <Text key={`t${i}`} x={sh.x} y={sh.y + 3} textAnchor="middle" style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold" }} fill={C.brandDark}>
          {sh.label}
        </Text>
      ))}
      <NorthAndScale W={W} H={H} scale={map.scale} />
    </Svg>
  );
}

export function Footer({ text }: { text: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{text}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export function SignatureBlock({ name, role, lines, supervisor }: { name: string; role: string; lines: string[]; supervisor: string }) {
  return (
    <View style={{ marginTop: 26, alignItems: "center" }} wrap={false}>
      <View style={{ width: 230, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 5, alignItems: "center" }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5 }}>{name}</Text>
        {role ? <Text style={[s.muted, { marginTop: 1 }]}>{role}</Text> : null}
        {lines.map((l) => (
          <Text key={l} style={s.muted}>
            {l}
          </Text>
        ))}
        {supervisor ? <Text style={{ marginTop: 4, fontSize: 8.5 }}>{supervisor}</Text> : null}
      </View>
    </View>
  );
}
