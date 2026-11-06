import { Document, Image as PdfImage, Page, Text, View } from "@react-pdf/renderer";
import { C, FINDING_COLOR, FarmMap, Footer, Header, InfoGrid, Section, SignatureBlock, Table, s } from "./parts";
import type { SeasonPdfModel } from "./season-model";
import type { PdfPhoto } from "./visit-model";

const photoRows = (photos: PdfPhoto[]) => Array.from({ length: Math.ceil(photos.length / 2) }, (_, i) => photos.slice(i * 2, i * 2 + 2));

/** Relatório final da safra: resumo, mapa, talhões, ocorrências, linha do tempo das visitas, custos (gestão), fotos e assinatura. */
export function SeasonPdf({ m }: { m: SeasonPdfModel }) {
  return (
    <Document title={`${m.title} - ${m.headTitle}`} author={m.signature?.name ?? "AgroNexus"} creator="AgroNexus" language="pt-BR">
      <Page size="A4" style={s.page}>
        <Header logo={m.logo} eyebrow={m.title} title={m.headTitle} sub={m.sub} />
        {m.period ? <Text style={[s.muted, { marginTop: 8, fontSize: 9 }]}>{m.period}</Text> : null}

        <View style={{ marginTop: 10 }}>
          <InfoGrid cells={m.summary} />
        </View>

        {m.map ? (
          <View style={[s.card, { marginTop: 12, padding: 4, alignItems: "center" }]} wrap={false}>
            <FarmMap map={m.map} />
            <Text style={[s.muted, { fontSize: 7, marginTop: 2 }]}>Contorno dos talhões da safra</Text>
          </View>
        ) : null}

        <Section title="Talhões">
          <Table header={m.plots.header} rows={m.plots.rows} widths={[2.2, 1.6, 1.1, 1.1, 1, 1.2]} />
        </Section>

        {m.findings.length ? (
          <Section title="Pragas, doenças e daninhas na safra">
            <View style={[s.tr, { paddingTop: 0 }]}>
              <Text style={[s.th, { width: 82 }]}>Tipo</Text>
              <Text style={[s.th, { flex: 2 }]}>Ocorrência</Text>
              <Text style={[s.th, { flex: 1 }]}>Visitas</Text>
              <Text style={[s.th, { flex: 1 }]}>Talhões</Text>
              <Text style={[s.th, { flex: 2 }]}>Quando</Text>
            </View>
            {m.findings.map((f, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <View style={{ width: 82 }}>
                  <Text style={[s.tag, { backgroundColor: FINDING_COLOR[f.kind].bg, color: FINDING_COLOR[f.kind].fg, alignSelf: "flex-start" }]}>{f.kindLabel}</Text>
                </View>
                <Text style={{ flex: 2, fontFamily: "Helvetica-Bold" }}>{f.name}</Text>
                <Text style={{ flex: 1 }}>{f.visits}</Text>
                <Text style={{ flex: 1 }}>{f.plots}</Text>
                <Text style={[s.muted, { flex: 2 }]}>{f.first === f.last ? f.first : `${f.first} a ${f.last}`}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {/* Linha do tempo "plana": cada visita é filha direta da página. Blocos aninhados que quebram de página
            deixam buraco no react-pdf. O título da seção e o nome do talhão vão grudados na primeira visita. */}
        {m.timeline.flatMap((t, p) =>
          t.rows.map((r, i) => (
            <View key={`${p}.${i}`} wrap={false} style={i === 0 ? { marginTop: p === 0 ? 14 : 8 } : undefined}>
              {p === 0 && i === 0 ? <Text style={s.h2}>{`Visitas técnicas (${m.visitCount})`}</Text> : null}
              {i === 0 ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 2 }}>{t.plot}</Text> : null}
              <View style={[s.tr, { alignItems: "flex-start" }]}>
                <View style={{ width: 70 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.date}</Text>
                  <Text style={[s.muted, { fontSize: 7.5 }]}>{r.dap !== "—" ? `${r.dap} dias` : ""}</Text>
                </View>
                <View style={{ width: 92 }}>
                  <Text>{r.kind}</Text>
                  <Text style={[s.muted, { fontSize: 7.5 }]}>Estágio {r.stage}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text>{r.seen}</Text>
                  {r.recommendation ? <Text style={{ color: C.brand, marginTop: 2 }}>Recomendação: {r.recommendation}</Text> : null}
                </View>
              </View>
            </View>
          )),
        )}

        {m.finance.length ? (
          <Section title="Custos e resultado" wrap={false}>
            <InfoGrid cells={m.finance} />
          </Section>
        ) : null}

        {photoRows(m.photos).map((row, r) => (
          // Cada linha de 2 fotos fica inteira; a primeira leva o título junto.
          <View key={r} style={r === 0 ? s.section : { marginTop: 8 }} wrap={false}>
            {r === 0 ? <Text style={s.h2}>Fotos da safra</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {row.map((p, i) => (
                <View key={i} style={{ width: "48.5%" }}>
                  <PdfImage src={p.src} style={{ width: "100%", height: 170, objectFit: "cover", borderRadius: 6 }} />
                  {p.caption ? <Text style={[s.muted, { fontSize: 8, marginTop: 3 }]}>{p.caption}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        {m.signature ? <SignatureBlock {...m.signature} /> : null}

        <Footer text={m.footer} />
      </Page>
    </Document>
  );
}
