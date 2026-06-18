export type MorningDigestPresentation = {
  headline: string;
  bullets: string[];
};

function stripDigestDecorations(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripBulletPrefix(value: string) {
  return value.replace(/^[-•*]\s*/, "").trim();
}

export function formatMorningDigest(value: string, maxBullets = 3): MorningDigestPresentation {
  const cleaned = stripDigestDecorations(value);
  if (!cleaned) {
    return { headline: "", bullets: [] };
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) => stripBulletPrefix(stripDigestDecorations(line)))
    .filter(Boolean);

  if (lines.length === 0) {
    return { headline: "", bullets: [] };
  }

  let headline = lines[0];
  let bullets = lines.slice(1);

  if (bullets.length === 0) {
    const inlineSegments = headline
      .split(/\s+\-\s+/)
      .map((segment) => stripDigestDecorations(segment))
      .filter(Boolean);

    if (inlineSegments.length > 1) {
      headline = inlineSegments[0];
      bullets = inlineSegments.slice(1);
    }
  }

  headline = stripDigestDecorations(headline);
  bullets = bullets.map((bullet) => stripDigestDecorations(stripBulletPrefix(bullet))).filter(Boolean).slice(0, maxBullets);

  return { headline, bullets };
}
