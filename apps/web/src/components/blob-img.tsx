"use client";

import { useEffect, useState } from "react";

/** Mostra uma foto guardada como Blob, criando e liberando a URL temporária. */
export function BlobImg({ blob, alt, className = "" }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    const u = URL.createObjectURL(blob);
    // setState fora do corpo síncrono do efeito; também funciona no modo estrito do React.
    Promise.resolve().then(() => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(u);
    };
  }, [blob]);
  if (!url) return <div className={`bg-border/50 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}
