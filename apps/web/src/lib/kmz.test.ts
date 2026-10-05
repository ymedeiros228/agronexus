import { describe, expect, it } from "vitest";
import { parseShapes } from "./geo";
import { kmzToKml } from "./kmz";

const KML = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Talhão 7</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-46.0,-7.5 -45.99,-7.5 -45.99,-7.51 -46.0,-7.51 -46.0,-7.5</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Document></kml>`;

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP mínimo (sem CRC conferido pelo leitor) com os arquivos dados. */
async function zip(files: { name: string; text: string; method: 0 | 8 }[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const plain = enc.encode(f.text);
    const data = f.method === 8 ? await deflateRaw(plain) : plain;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.method, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, plain.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(10, f.method, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, plain.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[]).arrayBuffer();
}

describe("kmzToKml", () => {
  it("lê o doc.kml compactado e o contorno sai igual ao do .kml", async () => {
    const buf = await zip([
      { name: "files/foto.kml.txt", text: "x", method: 0 },
      { name: "doc.kml", text: KML, method: 8 },
    ]);
    const kml = await kmzToKml(buf);
    expect(kml).toBe(KML);
    expect(parseShapes(kml)).toEqual(parseShapes(KML));
    expect(parseShapes(kml)[0].name).toBe("Talhão 7");
  });

  it("aceita .kml sem compactação e com outro nome", async () => {
    expect(await kmzToKml(await zip([{ name: "area.kml", text: KML, method: 0 }]))).toBe(KML);
  });

  it("recusa arquivo que não é zip ou sem .kml", async () => {
    await expect(kmzToKml(new TextEncoder().encode("não é zip").buffer as ArrayBuffer)).rejects.toThrow("inválido");
    await expect(kmzToKml(await zip([{ name: "a.txt", text: "x", method: 0 }]))).rejects.toThrow("nenhum .kml");
  });
});
