/**
 * The QR code of a guest pass (RES-03 c1, BR-11): it holds the same 6 digits as the code, so the guard's phone can
 * scan it instead of typing the code (SG-02). Drawn as an SVG with the `qrcode` package, so it stays sharp at any
 * size and needs no canvas.
 *
 * @author Mahir Al Kamal
 */
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Props for {@link PassQrCode}. */
export interface PassQrCodeProps {
  /** The 6-digit pass code. */
  code: string;
}

/**
 * The QR code for a pass, once it is drawn. Nothing shows if it can't be drawn; the code above it still works.
 * @param props - The pass code.
 * @returns The QR code image, or nothing.
 */
export function PassQrCode({ code }: PassQrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((drawn) => {
        if (current) setSvg(drawn);
      })
      .catch(() => {
        if (current) setSvg(null);
      });
    return () => {
      current = false;
    };
  }, [code]);

  if (!svg) return null;
  return (
    // A data URL, not inline SVG markup, so nothing from the library is put into the page as HTML.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={`QR code for pass ${code}`}
      className="size-44 rounded-lg bg-white p-1"
    />
  );
}
