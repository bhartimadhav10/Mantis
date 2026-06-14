"use client";

import { useState } from "react";

// Renders a real product image when available; otherwise a polished gradient
// tile with the product emoji. Also falls back to the tile if the image fails
// to load — so the demo never shows a broken image.
export default function Thumb({
  emoji,
  accent,
  image,
  className,
}: {
  emoji: string;
  accent: string;
  image?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = image && !broken;

  return (
    <div className={`thumb ${className ?? ""}`} style={{ background: accent }}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="thumb-emoji">{emoji}</span>
      )}
    </div>
  );
}
