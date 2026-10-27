import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PLATFORMS, type SourceAnalysis } from "./platforms";
import { quoteInSource, reconcileClaims, overallStatus, type Claim } from "./verify";
import { cleanGenerated, STYLE_RULES } from "./clean-text";

const MAX_SOURCE = 30000;
const sourceText = z.string().trim().min(20, "Add a bit more source text (at least 20 characters).").max(MAX_SOURCE);
const settingsSchema = z.object({
  audience: z.string().max(40),
  tone: z.string().max(40),
  language: z.string().max(40),
  objective: z.string().max(40),
  outputType: z.string().max(20),
  hook: z.string().max(40),
  voiceSample: z.string().max(3000).default(""),
});
const factSchema = z.object({
  id: z.string(),
  category: z.string(),
  claim: z.string(),
  source_quote: z.string(),
  quote_verified: z.boolean().optional(),
});
const analysisSchema = z.object({
  title: z.string().default("Untitled source"),
  summary: z.string().default(""),
  purpose: z.string().default(""),
  key_facts: z.array(factSchema).default([]),
  ambiguities: z.array(z.string()).default([]),
});
const platformIds = PLATFORMS.map((p) => p.id) as [string, ...string[]];

async function ai() {
  return import("./ai.server");
}
function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : "Unexpected error";
  throw new Error(msg);
}

// ---------- 1. Source understanding ----------
export const analyzeSource = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ text: sourceText }).parse(d))
  .handler(async ({ data }): Promise<SourceAnalysis> => {
    try {
      const { runJson } = await ai();
      const raw = await runJson(
        "You are a meticulous information extraction engine. Extract only what the source states. Never infer or embellish.",
        `Analyse the SOURCE and return JSON:
{"title":string,"summary":string,"purpose":string,
 "key_facts":[{"id":"fact_1","category":"deadline|date|eligibility|fee|amount|location|instruction|contact|other","claim":string,"source_quote":"EXACT verbatim substring copied from the source"}],
 "ambiguities":[string]}
Include every date, deadline, amount, fee, eligibility rule, location and instruction as separate facts.

SOURCE:
"""${data.text}"""`,
      );
      const parsed = analysisSchema.parse(raw);
      parsed.key_facts = parsed.key_facts.map((f) => ({ ...f, quote_verified: quoteInSource(f.source_quote, data.text) }));
      return parsed;
    } catch (e) {
      fail(e);
    }
  });

// ---------- 2. Content generation ----------
const outputSchema = z.object({ platform: z.string(), headline: z.string().default(""), text: z.string() });
export const generateContent = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        text: sourceText,
        analysis: analysisSchema,
        settings: settingsSchema,
        platforms: z.array(z.enum(platformIds)).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const s = data.settings;
      const specs = data.platforms.map((id) => {
        const p = PLATFORMS.find((x) => x.id === id)!;
        return `- "${p.id}" (${p.label}): ${p.spec}`;
      });
      const raw = await runJson(
        `You are InfoMorph, an evidence-aware content studio. You adapt format, tone and creativity, but you NEVER change, add or omit factual information (dates, numbers, names, eligibility, fees, instructions). Never invent statistics, prizes, engagement numbers or trends.\n${STYLE_RULES}`,
        `Create content for each platform below from the VERIFIED FACTS and SOURCE. Each platform must have its own structure and length, not the same text reworded.
Audience: ${s.audience}. Tone: ${s.tone}. Objective: ${s.objective}. Opening hook style: ${s.hook}${s.hook === "Statistic" ? " (only use numbers present in the source; otherwise use a factual figure from it like the date)" : ""}.
Language: write ALL output (headline and text) in ${s.language}. Keep dates, numbers and names factually identical.
${s.voiceSample ? `Match this writing voice:\n"""${s.voiceSample}"""` : ""}

Platforms:
${specs.join("\n")}

Return JSON: {"outputs":[{"platform":"<id>","headline":"short punchy visual headline (max 8 words)","text":"full platform-ready copy with line breaks"}]}

VERIFIED FACTS:
${JSON.stringify(data.analysis.key_facts.map((f) => f.claim))}

SOURCE:
"""${data.text}"""`,
      );
      const outputs = z.object({ outputs: z.array(outputSchema) }).parse(raw).outputs
        .filter((o) => data.platforms.includes(o.platform))
        .map((o) => ({ ...o, headline: cleanGenerated(o.headline), text: cleanGenerated(o.text) }));
      if (!outputs.length) throw new Error("The AI did not return content for the selected platforms. Please retry.");
      return { outputs };
    } catch (e) {
      fail(e);
    }
  });

// ---------- 3. Claim verification ----------
const claimSchema = z.object({
  claim: z.string(),
  status: z.enum(["Supported", "Contradiction", "Unsupported", "Needs Review"]).catch("Needs Review"),
  source_quote: z.string().optional().nullable().transform((v) => v ?? undefined),
  explanation: z.string().optional().nullable().transform((v) => v ?? undefined),
});
export const verifyContent = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        text: sourceText,
        items: z.array(z.object({ platform: z.string(), text: z.string().min(1).max(20000) })).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const raw = await runJson(
        "You are a strict fact-checker. Compare every factual claim in generated content against the source. Content may be in another language; translate claims mentally to compare. Be skeptical.",
        `For each OUTPUT, list every factual claim (dates, deadlines, numbers, amounts, fees, eligibility, locations, instructions, names, benefits). For each claim give:
- status: "Supported" (source states it), "Contradiction" (source states something different), "Unsupported" (source never mentions it), "Needs Review" (unclear/partially supported)
- source_quote: EXACT verbatim substring from the source that supports or contradicts it ("" if none)
- explanation: one short sentence (in English)
Ignore pure opinions, greetings and calls to action unless they assert facts.

Return JSON: {"results":[{"platform":"<id>","claims":[{"claim":"...","status":"...","source_quote":"...","explanation":"..."}]}]}

SOURCE:
"""${data.text}"""

OUTPUTS:
${data.items.map((i) => `### ${i.platform}\n${i.text}`).join("\n\n")}`,
      );
      const results = z
        .object({ results: z.array(z.object({ platform: z.string(), claims: z.array(claimSchema).default([]) })) })
        .parse(raw).results;
      return {
        results: data.items.map((item) => {
          const found = results.find((r) => r.platform === item.platform);
          const claims: Claim[] = reconcileClaims((found?.claims ?? []) as Claim[], item.text, data.text);
          return { platform: item.platform, claims, status: found ? overallStatus(claims) : ("review" as const) };
        }),
      };
    } catch (e) {
      fail(e);
    }
  });

// ---------- 4. Revision comparison ----------
export const compareRevision = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        oldText: sourceText,
        newText: sourceText,
        outputs: z.array(z.object({ platform: z.string(), text: z.string().max(20000) })).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const raw = await runJson(
        "You compare two versions of a source document and detect factual changes precisely.",
        `Compare OLD and NEW source. List every factual change (dates, numbers, eligibility, fees, locations, instructions; added or removed facts too).
Then decide which generated OUTPUTS contain information affected by those changes.
Return JSON: {"changes":[{"field":"e.g. Registration deadline","old_value":"...","new_value":"..."}],"affected_platforms":["<platform id>"]}

OLD:
"""${data.oldText}"""

NEW:
"""${data.newText}"""

OUTPUTS:
${data.outputs.map((o) => `### ${o.platform}\n${o.text}`).join("\n\n")}`,
      );
      const parsed = z
        .object({
          changes: z.array(z.object({ field: z.string(), old_value: z.string().default(""), new_value: z.string().default("") })).default([]),
          affected_platforms: z.array(z.string()).default([]),
        })
        .parse(raw);
      // Deterministic backstop: any output literally containing an old value is affected.
      const affected = new Set(parsed.affected_platforms.filter((p) => data.outputs.some((o) => o.platform === p)));
      for (const c of parsed.changes) {
        const ov = c.old_value.trim().toLowerCase();
        if (ov.length < 3) continue;
        for (const o of data.outputs) if (o.text.toLowerCase().includes(ov)) affected.add(o.platform);
      }
      return { changes: parsed.changes, affected_platforms: [...affected] };
    } catch (e) {
      fail(e);
    }
  });

// ---------- 5. Audio briefing ----------
export const generateAudioScript = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ text: sourceText, settings: settingsSchema, facts: z.array(z.string()).max(60), narrationTone: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const s = data.settings;
      const raw = await runJson(
        `You write spoken audio briefings that never change facts from the source.\n${STYLE_RULES}`,
        `Write a 45-75 second single-narrator audio briefing meant to be read aloud. Short spoken sentences, natural pacing, dates and numbers written the way they should be spoken but factually identical. No stage directions, no [pause] tags, no speaker labels.
Audience: ${s.audience}. Narration tone: ${data.narrationTone}. Objective: ${s.objective}. Language: write the entire script in ${s.language}.
Return JSON {"title":string,"script":string}
FACTS: ${JSON.stringify(data.facts)}
SOURCE:
"""${data.text}"""`,
      );
      const p = z.object({ title: z.string().default("Audio briefing"), script: z.string().min(1) }).parse(raw);
      return { title: cleanGenerated(p.title), script: cleanGenerated(p.script) };
    } catch (e) {
      fail(e);
    }
  });

const VOICES = ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda"] as const;
export const synthesizeAudio = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ script: z.string().trim().min(5).max(5000), voice: z.enum(VOICES), language: z.string().max(40), narrationTone: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { synthesizeSpeech } = await ai();
      return await synthesizeSpeech(data.script, data.voice, `Read the following ${data.language} text aloud in a ${data.narrationTone.toLowerCase()}, natural voice with clear pronunciation and steady pacing:`);
    } catch (e) {
      fail(e);
    }
  });

// ---------- 6. Video storyboard ----------
const sceneSchema = z.object({
  title: z.string().default(""),
  duration: z.string().default(""),
  visual: z.string().default(""),
  camera: z.string().default(""),
  on_screen_text: z.string().default(""),
  voiceover: z.string().default(""),
  transition: z.string().default(""),
});
const storyboardSchema = z.object({
  title: z.string().default("Storyboard"),
  objective: z.string().default(""),
  hook: z.string().default(""),
  scenes: z.array(sceneSchema).min(1),
  music: z.string().default(""),
  cta: z.string().default(""),
  total_duration: z.string().default(""),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
const videoCfg = z.object({ format: z.string().max(40), length: z.string().max(10), aspect: z.string().max(20) });
const cleanScene = (sc: z.infer<typeof sceneSchema>) =>
  Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, cleanGenerated(v)])) as z.infer<typeof sceneSchema>;

export const generateStoryboard = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ text: sourceText, settings: settingsSchema, facts: z.array(z.string()).max(60), video: videoCfg }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const s = data.settings, v = data.video;
      const raw = await runJson(
        `You are a video director creating production-ready storyboards. Never change, add or omit facts from the source.\n${STYLE_RULES}`,
        `Create a ${v.length} ${v.format} storyboard, aspect ratio ${v.aspect}. Scene durations must add up to about ${v.length}. Use 3-7 scenes.
Audience: ${s.audience}. Tone: ${s.tone}. Objective: ${s.objective}. Write on-screen text and voiceover in ${s.language}; other fields in English.
Return JSON {"title":string,"objective":string,"hook":string,"scenes":[{"title":"e.g. Attention hook","duration":"0-3s","visual":string,"camera":"camera or animation direction","on_screen_text":string,"voiceover":string,"transition":string}],"music":"background music suggestion","cta":string,"total_duration":"e.g. 15s"}
FACTS: ${JSON.stringify(data.facts)}
SOURCE:
"""${data.text}"""`,
      );
      const sb = storyboardSchema.parse(raw);
      return { ...sb, title: cleanGenerated(sb.title), objective: cleanGenerated(sb.objective), hook: cleanGenerated(sb.hook), music: cleanGenerated(sb.music), cta: cleanGenerated(sb.cta), scenes: sb.scenes.map(cleanScene) };
    } catch (e) {
      fail(e);
    }
  });

export const regenerateScene = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ text: sourceText, settings: settingsSchema, storyboard: storyboardSchema, index: z.number().int().min(0).max(20), video: videoCfg }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { runJson } = await ai();
      const old = data.storyboard.scenes[data.index];
      if (!old) throw new Error("Scene not found.");
      const raw = await runJson(
        `You are a video director. Rewrite one storyboard scene with a fresh creative approach. Never change facts from the source.\n${STYLE_RULES}`,
        `Storyboard "${data.storyboard.title}" (${data.video.length} ${data.video.format}, ${data.video.aspect}). Rewrite scene ${data.index + 1}, keep duration "${old.duration}" and its role in the sequence. Language for on-screen text and voiceover: ${data.settings.language}. Tone: ${data.settings.tone}.
Full storyboard: ${JSON.stringify(data.storyboard.scenes)}
Return JSON {"title":string,"duration":string,"visual":string,"camera":string,"on_screen_text":string,"voiceover":string,"transition":string}
SOURCE:
"""${data.text}"""`,
      );
      return cleanScene(sceneSchema.parse(raw));
    } catch (e) {
      fail(e);
    }
  });

export const generateVideoClip = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ scene: sceneSchema, aspect: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { generateVideo } = await ai();
      const sc = data.scene;
      return await generateVideo(
        `Short ${data.aspect} video clip, ${sc.duration}. Visual: ${sc.visual}. Camera: ${sc.camera}. Show the on-screen text "${sc.on_screen_text}" clearly. Clean, modern, professional style.`,
      );
    } catch (e) {
      fail(e);
    }
  });

// ---------- Website import (server-side, SSRF-guarded) ----------
function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a = 0, b = 0] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return true;
  }
  if (h.includes(":")) return true; // block raw IPv6 literals
  if (/^\d+$/.test(h)) return true;
  return false;
}

export const importUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }) => {
    let url = new URL(data.url);
    for (let hop = 0; hop < 4; hop++) {
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) links are allowed.");
      if (blockedHost(url.hostname)) throw new Error("That address is not allowed.");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      let res: Response;
      try {
        res = await fetch(url.href, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": "InfoMorphBot/1.0", Accept: "text/html,text/plain" } });
      } catch {
        throw new Error("The website could not be reached. Paste its text instead.");
      } finally {
        clearTimeout(t);
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) throw new Error(`The website refused the request (HTTP ${res.status}). Paste its text instead.`);
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|xhtml/.test(type)) throw new Error("That link is not a readable web page.");
      const html = (await res.text()).slice(0, 2_000_000);
      const body = (html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html)
        .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
      if (body.length < 40) throw new Error("No readable text was found on that page. Paste its text instead.");
      return { text: body.slice(0, MAX_SOURCE), url: url.href };
    }
    throw new Error("Too many redirects.");
  });
