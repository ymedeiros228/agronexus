import { Document, Image as PdfImage, Page, Text, View } from "@react-pdf/renderer";
import { C, FINDING_COLOR, Footer, Header, InfoGrid, PlotMap, Section, SignatureBlock, Table, s } from "./parts";
import type { PdfPhoto } from "./visit-model";

const photoRows = (photos: PdfPhoto[]) => Array.from({ length: Math.ceil(photos.length / 2) }, (_, i) => photos.slice(i * 2, i * 2 + 2));
import type { VisitPdfModel } from "./visit-model";

/** PDF da visita: cabeçalho, dados, mapa do talhão, estande, achados, recomendação, fotos e assinatura. */
export function VisitPdf({ m, headline }: { m: VisitPdfModel; headline: string }) {
  return (
    <Document title={`${m.title} - ${m.farmName} - ${m.plotName}`} author={m.signature?.name ?? "AgroNexus"} creator="AgroNexus" language="pt-BR">
      <Page size="A4" style={s.page}>
        <Header
          logo={m.logo}
          eyebrow={m.title}
          title={`${m.farmName} · ${m.plotName}`}
          sub={m.producer ? `Produtor: ${m.producer}` : m.kindLabel}
          right={m.date}
        />

        <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <InfoGrid cells={m.info} />
            {headline ? (
              <View style={[s.card, { marginTop: 8, backgroundColor: C.brandSoft, borderColor: C.brandSoft }]}>
                <Text style={s.cellLabel}>Resultado da contagem</Text>
                <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.brandDark, marginTop: 2 }}>{headline}</Text>
              </View>
            ) : null}
          </View>
          {m.map ? (
            <View style={[s.card, { padding: 4, alignItems: "center" }]}>
              <PlotMap map={m.map} />
              <Text style={[s.muted, { fontSize: 7, marginTop: 2 }]}>Contorno do talhão{m.map.points.length ? " e pontos marcados" : ""}</Text>
            </View>
          ) : null}
        </View>

        {m.findings.length ? (
          <Section title="O que foi encontrado">
            {m.findings.map((f, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <View style={{ width: 82 }}>
                  <Text style={[s.tag, { backgroundColor: FINDING_COLOR[f.kind].bg, color: FINDING_COLOR[f.kind].fg, alignSelf: "flex-start" }]}>{f.kindLabel}</Text>
                </View>
                <Text style={{ flex: 2, fontFamily: "Helvetica-Bold" }}>{f.name}</Text>
                <Text style={{ flex: 1.3 }}>{f.amount || "—"}</Text>
                <Text style={[s.muted, { flex: 2 }]}>{f.note}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {m.stand ? (
          <Section title={m.stand.title}>
            {m.stand.lines.map((l) => (
              <Text key={l} style={[s.body, { marginBottom: 2 }]}>
                {l}
              </Text>
            ))}
            {m.stand.rows.length > 1 ? (
              <View style={{ marginTop: 6 }}>
                <Table header={m.stand.header} rows={m.stand.rows} />
              </View>
            ) : null}
          </Section>
        ) : null}

        {m.observations ? (
          <Section title="Observações">
            <Text style={s.body}>{m.observations}</Text>
          </Section>
        ) : null}

        {m.recommendation ? (
          <Section title="Recomendação técnica" wrap={false}>
            <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: C.brand, backgroundColor: "#f6faf7" }]}>
              <Text style={s.body}>{m.recommendation}</Text>
            </View>
          </Section>
        ) : null}

        {m.followUp ? (
          <View style={[s.card, { marginTop: 10, backgroundColor: C.warnSoft, borderColor: C.warnSoft, flexDirection: "row", justifyContent: "space-between" }]} wrap={false}>
            <Text style={{ color: C.warn, fontFamily: "Helvetica-Bold" }}>Retorno combinado</Text>
            <Text style={{ color: C.warn, fontFamily: "Helvetica-Bold" }}>{m.followUp}</Text>
          </View>
        ) : null}

        {photoRows(m.photos).map((row, r) => (
          // Cada linha de 2 fotos fica inteira; a primeira leva o título junto, para ele não sobrar sozinho no pé da página.
          <View key={r} style={r === 0 ? s.section : { marginTop: 8 }} wrap={false}>
            {r === 0 ? <Text style={s.h2}>{`Fotos (${m.photos.length})`}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {row.map((p, i) => (
                <View key={i} style={{ width: "48.5%" }}>
                  <PdfImage src={p.src} style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 6 }} />
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
