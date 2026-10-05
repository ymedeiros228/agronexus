/**
 * Leitura de .kmz (Google Earth): um ZIP com o .kml dentro, quase sempre "doc.kml".
 * Usa o DecompressionStream do navegador, sem biblioteca de ZIP.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Devolve o texto do primeiro .kml do arquivo (doc.kml tem preferência). Erro se não for um .kmz válido. */
export async function kmzToKml(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Fim do diretório central: nos últimos 22 bytes, mais um comentário opcional de até 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo .kmz inválido.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: { name: string; method: number; size: number; offset: number }[] = [];
  for (let n = 0; n < count && view.getUint32(p, true) === CENTRAL; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    entries.push({ name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)), method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const kmls = entries.filter((e) => /\.kml$/i.test(e.name));
  const entry = kmls.find((e) => /(^|\/)doc\.kml$/i.test(e.name)) ?? kmls[0];
  if (!entry) throw new Error("O .kmz não tem nenhum .kml dentro.");
  if (view.getUint32(entry.offset, true) !== LOCAL) throw new Error("Arquivo .kmz inválido.");
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const raw = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return decoder.decode(raw);
  if (entry.method === 8) return decoder.decode(await inflateRaw(raw));
  throw new Error("Compactação do .kmz não suportada.");
}

/** Texto de um arquivo de contorno: .kmz é descompactado, o resto é lido como está. */
export async function readShapeText(file: File): Promise<string> {
  return /\.kmz$/i.test(file.name) ? kmzToKml(await file.arrayBuffer()) : file.text();
}
