// Removes AI-style formatting artifacts from generated copy without touching numbers, ranges, URLs or quotes.
const BANNED: [RegExp, string][] = [
  [/\b(?:In today's fast-paced world|In the ever-evolving landscape of|Unlock the power of|Dive into|Let's dive in)[,:]?\s*/gi, ""],
];

export function cleanGenerated(input: string): string {
  let t = input;
  // Markdown bold/italic/heading markers → plain text
  t = t.replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1");
  t = t.replace(/(^|\s)\*(\S[^*\n]*?\S|\S)\*(?=\s|[.,!?]|$)/g, "$1$2");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*[*]\s+/gm, "• ");
  // Numeric ranges with en/em dash keep a plain hyphen (e.g. 10–12, 0–3s)
  t = t.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2");
  // Em/en dashes used as sentence breaks → comma
  t = t.replace(/\s*—\s*/g, ", ").replace(/\s+–\s+/g, ", ").replace(/–/g, "-");
  // Double hyphens and spaced single hyphens used as dashes → comma
  t = t.replace(/\s*-{2,}\s*/g, ", ");
  t = t.replace(/(\S)\s+-\s+(?=\S)/g, "$1, ");
  t = t.replace(/^\s*-\s+/gm, "• ");
  // Any leftover asterisks
  t = t.replace(/\*+/g, "");
  t = t.replace(/,\s*,/g, ",").replace(/,\s*([.!?:])/g, "$1").replace(/^,\s*/gm, "");
  for (const [re, rep] of BANNED) t = t.replace(re, rep);
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const STYLE_RULES = `Writing style rules (strict):
- Sound like a skilled human writer. Natural, clear, specific.
- Do NOT use em dashes (—) or en dashes (–). Use commas, full stops or colons instead.
- Do NOT use Markdown (no **, no #, no _). Plain text with line breaks only. Use "•" for bullets if a list is needed.
- No clichés such as "unlock", "dive into", "game-changer", "in today's fast-paced world", "don't miss out".
- At most one call to action. Emojis only where the platform genuinely uses them, and sparingly (max 2).
- Tone guide: Professional = polished, concise. Friendly = warm, conversational. Bold & Punchy = energetic, short sentences, no exaggeration. Storytelling = engaging narrative, never invent events or people.`;
