export const PLATFORMS = [
  { id: "instagram", label: "Instagram Post", spec: "Attention-grabbing headline, caption, relevant hashtags, a clear call to action only if the source supports one." },
  { id: "igstory", label: "Instagram Story", spec: "3-5 story frames labelled 'FRAME 1', 'FRAME 2'..., each with very short readable text, clear progression." },
  { id: "whatsapp", label: "WhatsApp Message", spec: "Concise forwardable message, key info highlighted with *bold* WhatsApp markup, all relevant details preserved." },
  { id: "wastatus", label: "WhatsApp Status", spec: "Very short status copy (under 250 chars) with only essential facts." },
  { id: "linkedin", label: "LinkedIn Post", spec: "Professional opening line, structured body with short paragraphs, insights without inventing facts, 2-4 hashtags." },
  { id: "blog", label: "Blog", spec: "Headline, introduction, 2-4 clearly titled sections, conclusion." },
  { id: "reel", label: "YouTube Short-form", spec: "Video hook, scene-by-scene script (SCENE 1 — HOOK (0-3s) ...), voiceover lines and visual directions per scene." },
  { id: "youtube", label: "YouTube Caption", spec: "Video caption/description plus relevant hashtags." },
  { id: "x", label: "Twitter / X", spec: "Concise post under 280 chars; if more is needed, a numbered thread (1/, 2/...)." },
  { id: "email", label: "Email", spec: "Start with 'Subject: ...', then greeting, body, closing." },
] as const;
export type PlatformId = (typeof PLATFORMS)[number]["id"];
export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

export interface Settings {
  audience: string;
  tone: string;
  language: string;
  objective: string;
  outputType: string;
  hook: string;
  voiceSample: string;
}

export interface Fact {
  id: string;
  category: string;
  claim: string;
  source_quote: string;
  quote_verified?: boolean | undefined;
}
export interface SourceAnalysis {
  title: string;
  summary: string;
  purpose: string;
  key_facts: Fact[];
  ambiguities: string[];
}
