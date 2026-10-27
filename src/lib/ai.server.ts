// Server-only Gemini API integration. Keep the API key out of browser code.
const API = "https://generativelanguage.googleapis.com/v1beta";
export const TEXT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
];
export const TTS_MODEL_DEFAULT = "gemini-3.1-flash-tts-preview";
export const VIDEO_MODEL_DEFAULT = "gemini-omni-1.1-flash";

export class AiError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
function key(): string {
  const value = process.env["GEMINI_API_KEY"];
  if (!value?.trim()) throw new AiError("GEMINI_API_KEY is not configured on the server.", 401);
  if (/\s/.test(value.trim())) throw new AiError("GEMINI_API_KEY contains whitespace. Check the server secret.", 401);
  return value.trim();
}
function modelName(name: string): string { return name.replace(/^google\//, ""); }
async function request(path: string, body?: unknown, timeoutMs = 150000): Promise<Response> {
  const apiKey = key();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError(ctrl.signal.aborted ? "The AI took too long to respond. Please retry." : `Could not reach the AI service: ${(e as Error).message}`, 504);
  } finally { clearTimeout(timer); }
}
async function errorFrom(res: Response, model: string): Promise<AiError> {
  const raw = await res.text().catch(() => "");
  let message = raw;
  try { const parsed = JSON.parse(raw); message = parsed?.error?.message ?? parsed?.message ?? raw; } catch { /* plain response */ }
  const short = String(message).split("\n")[0]!.slice(0, 300);
  if (res.status === 429) return new AiError(`Gemini quota or rate limit reached (${model}): ${short}`, 429);
  return new AiError(`Gemini request failed (${res.status}, ${model}): ${short}`, res.status);
}
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/), end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start < 0 || end < start) throw new AiError("The AI returned an unreadable response. Please retry.", 502);
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new AiError("The AI returned malformed JSON. Please retry.", 502); }
}
const switchable = (status: number) => status === 429 || status === 404 || status === 403 || status >= 500;
type Part = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type ContentResponse = { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] };

export async function runJson(system: string, prompt: string): Promise<unknown> {
  const override = process.env["INFOMORPH_MODEL"];
  const models = [...new Set([...(override ? [modelName(override)] : []), ...TEXT_MODELS])];
  let last: AiError | null = null;
  for (const model of models) {
    try {
      const res = await request(`/models/${encodeURIComponent(model)}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nRespond with JSON only.` }] }],
        generationConfig: { responseMimeType: "application/json" },
      });
      if (!res.ok) throw await errorFrom(res, model);
      const json = await res.json() as ContentResponse;
      const output = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!output.trim()) throw new AiError(`${model} returned an empty response.`, 502);
      return extractJson(output);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
      if (!switchable(err.status)) throw err;
      last = err;
      console.warn(`[ai] ${model} failed (${err.status}), switching model`);
    }
  }
  throw last ?? new AiError("All Gemini models are busy. Please retry.", 429);
}
function wavFromPcm(pcm: Uint8Array, rate = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length), v = new DataView(out.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length, true); out.set(pcm, 44); return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s);
}
export async function synthesizeSpeech(script: string, voice: string, style: string): Promise<{ base64: string; mimeType: string; model: string }> {
  const models = [...new Set([modelName(process.env["INFOMORPH_TTS_MODEL"] || TTS_MODEL_DEFAULT), "gemini-3.8-flash-tts"])];
  let last: AiError | null = null;
  for (const model of models) {
    const res = await request(`/models/${encodeURIComponent(model)}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: `${style}\n\n${script}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }, 170000);
    if (!res.ok) { last = await errorFrom(res, model); if (switchable(last.status)) continue; throw last; }
    const json = await res.json() as ContentResponse;
    const audio = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!audio?.data) { last = new AiError("Speech service returned no audio.", 502); continue; }
    const binary = atob(audio.data), pcm = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const wav = pcm[0] === 0x52 && pcm[1] === 0x49 && pcm[2] === 0x46 && pcm[3] === 0x46 ? pcm : wavFromPcm(pcm, Number(audio.mimeType?.match(/rate=(\d+)/)?.[1] || 24000));
    return { base64: bytesToB64(wav), mimeType: "audio/wav", model };
  }
  throw last ?? new AiError("Speech generation failed. Please retry.", 502);
}
export async function generateVideo(prompt: string): Promise<{ base64: string; mimeType: string; model: string }> {
  const model = modelName(process.env["INFOMORPH_VIDEO_MODEL"] || VIDEO_MODEL_DEFAULT);
  const res = await request("/interactions", { model, input: prompt, response_format: { type: "video", resolution: "720p" } }, 180000);
  if (!res.ok) throw await errorFrom(res, model);
  const result = await res.json() as { status?: string; error?: { message?: string }; steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[] };
  if (result.error || (result.status && result.status !== "completed")) throw new AiError(`Video generation did not complete: ${result.error?.message || result.status}`, 502);
  const video = result.steps?.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).find((p) => p.type === "video" && p.data);
  if (!video?.data) throw new AiError("Video service returned no video. Please retry.", 502);
  return { base64: video.data, mimeType: video.mime_type || "video/mp4", model };
}
