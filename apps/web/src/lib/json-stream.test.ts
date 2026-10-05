import { describe, expect, it } from "vitest";
import { JsonStreamError, readJsonObject } from "./json-stream";

async function read(text: string, chunkSize: number) {
  const fields: Record<string, unknown> = {};
  const items: unknown[] = [];
  await readJsonObject(
    new Blob([text]),
    "photos",
    (k, v) => {
      fields[k] = v;
    },
    (v) => {
      items.push(v);
    },
    chunkSize,
  );
  return { fields, items };
}

const sample = {
  app: "agronexus",
  version: 1,
  ok: true,
  nada: null,
  farms: [{ id: "f1", name: 'Fazenda "Boa" \\ Vista', notes: "linha\nnova, {chave} [lista]" }],
  photos: [
    { id: "ph1", label: "Sem alteração 🌱", blob: "data:image/jpeg;base64,/9j/AAA=" },
    { id: "ph2", nested: { a: [1, 2, { b: "}]" }] } },
  ],
  depois: { x: -1.5e3 },
};

describe("readJsonObject", () => {
  it("lê igual ao JSON.parse em qualquer tamanho de pedaço", async () => {
    const { photos, ...rest } = sample;
    for (const text of [JSON.stringify(sample), JSON.stringify(sample, null, 2)]) {
      for (const size of [1, 2, 3, 5, 7, 64, 1 << 20]) {
        const { fields, items } = await read(text, size);
        expect(fields).toEqual(rest);
        expect(items).toEqual(photos);
      }
    }
  });

  it("aceita lista vazia e objeto vazio", async () => {
    expect(await read(`{"photos":[]}`, 3)).toEqual({ fields: {}, items: [] });
    expect(await read(` { } `, 1)).toEqual({ fields: {}, items: [] });
  });

  it("recusa JSON quebrado ou cortado", async () => {
    for (const text of ["", "[]", "{", `{"a":1`, `{"a":}`, `{"photos":[{"id":1}`, `{"a":1}x`, `{"a" 1}`]) {
      await expect(read(text, 2)).rejects.toBeInstanceOf(JsonStreamError);
    }
  });
});
