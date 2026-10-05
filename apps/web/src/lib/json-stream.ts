/**
 * Leitura em pedaços de um arquivo JSON cujo topo é um objeto. Cada campo chega já convertido,
 * menos o campo `streamKey` (uma lista), cujos itens chegam um a um. Assim um backup com
 * centenas de MB de fotos nunca vira um texto único na memória.
 */

const STRING_STOP = /["\\]/g;
const WHITESPACE = /\s/;

export class JsonStreamError extends Error {}

type Expect = "start" | "key" | "colon" | "value" | "item" | "sep" | "end";

export async function readJsonObject(
  file: Blob,
  streamKey: string,
  onField: (key: string, value: unknown) => Promise<void> | void,
  onItem: (value: unknown) => Promise<void> | void,
  chunkSize = 1 << 20,
): Promise<void> {
  const decoder = new TextDecoder();
  let expect: Expect = "start";
  let depth = 0;
  let inString = false;
  let skipNext = false; // barra invertida no fim do pedaço anterior
  let key = "";
  let mode: "key" | "value" | "item" | null = null; // o que está sendo capturado
  let capDepth = 0;
  let parts: string[] = [];
  let capStart = 0;

  const bad = (): never => {
    throw new JsonStreamError("JSON inválido");
  };
  const parse = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return bad();
    }
  };

  for (let offset = 0; offset < file.size || offset === 0; offset += chunkSize) {
    const last = offset + chunkSize >= file.size;
    const text = decoder.decode(await file.slice(offset, offset + chunkSize).arrayBuffer(), { stream: !last });
    capStart = 0;
    let i = 0;

    const finish = async (end: number) => {
      parts.push(text.slice(capStart, end));
      const value = parse(parts.join(""));
      parts = [];
      const m = mode;
      mode = null;
      if (m === "key") {
        if (typeof value !== "string") bad();
        key = value as string;
        expect = "colon";
      } else if (m === "value") {
        await onField(key, value);
        expect = "sep";
      } else {
        await onItem(value);
        expect = "item";
      }
    };

    while (i < text.length) {
      if (inString) {
        if (skipNext) {
          skipNext = false;
          i++;
          continue;
        }
        STRING_STOP.lastIndex = i;
        const m = STRING_STOP.exec(text);
        if (!m) {
          i = text.length;
          break;
        }
        if (m[0] === "\\") {
          i = m.index + 2;
          if (i > text.length) {
            skipNext = true;
            i = text.length;
          }
          continue;
        }
        inString = false;
        i = m.index + 1;
        if (mode === "key") await finish(i);
        continue;
      }

      const c = text[i];
      if (mode) {
        if (c === '"') inString = true;
        else if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          if (depth === capDepth) {
            await finish(i);
            continue; // o fechamento é tratado abaixo, fora da captura
          }
          depth--;
        } else if (c === "," && depth === capDepth) {
          await finish(i);
          continue;
        }
        i++;
        continue;
      }

      if (WHITESPACE.test(c)) {
        i++;
        continue;
      }
      const startCapture = (m: "key" | "value" | "item") => {
        mode = m;
        capDepth = depth;
        capStart = i;
      };
      // `finish` também muda `expect`; o cast evita que o TypeScript ignore essa mudança.
      switch (expect as Expect) {
        case "start":
          if (c !== "{") bad();
          depth = 1;
          expect = "key";
          i++;
          break;
        case "key":
          if (c === "}") {
            depth = 0;
            expect = "end";
            i++;
          } else if (c === '"') {
            startCapture("key");
            inString = true;
            i++;
          } else bad();
          break;
        case "colon":
          if (c !== ":") bad();
          expect = "value";
          i++;
          break;
        case "value":
          if (key === streamKey && c === "[") {
            depth = 2;
            expect = "item";
            i++;
          } else startCapture("value");
          break;
        case "item":
          if (c === ",") i++;
          else if (c === "]") {
            depth = 1;
            expect = "sep";
            i++;
          } else startCapture("item");
          break;
        case "sep":
          if (c === ",") expect = "key";
          else if (c === "}") {
            depth = 0;
            expect = "end";
          } else bad();
          i++;
          break;
        case "end":
          bad();
      }
    }
    if (mode) parts.push(text.slice(capStart));
    if (last) break;
  }
  if (expect !== "end") bad();
}
