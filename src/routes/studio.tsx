import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORMS, platformLabel, type Settings, type SourceAnalysis } from "@/lib/platforms";
import type { Claim } from "@/lib/verify";
import {
  analyzeSource,
  compareRevision,
  generateContent,
  generateAudioScript,
  synthesizeAudio,
  generateStoryboard,
  regenerateScene,
  generateVideoClip,
  importUrl,
  verifyContent,
  type Storyboard,
} from "@/lib/infomorph.functions";
import { AudioPanel, StoryboardPanel, storyboardText, type AudioState, type StoryState, type VideoCfg } from "@/components/MediaPanels";

const b64Blob = (b64: string, type: string) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "InfoMorph — Content Studio" },
      { name: "description", content: "Add a source, choose platforms and tone, and generate fact-checked content for ten channels." },
      { property: "og:title", content: "InfoMorph — Content Studio" },
      { property: "og:description", content: "Generate platform-ready, source-verified content from one document." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Studio,
});

const PRESETS = {
  college:
    "Final-year undergraduate students can apply for the Innovation Showcase. Registration closes on 15 November 2026. Register using the student portal. There is no registration fee.",
  event:
    "The City Design Festival takes place on 22 December 2026 at the Community Hall. Entry begins at 10:00 AM. Admission is free. Visitors must register online.",
  ngo: "GreenSteps is organizing a community cleanup on 7 November 2026 at Riverside Park. Volunteers should arrive by 8:30 AM. Gloves and collection bags will be provided.",
} as const;
type PresetKey = keyof typeof PRESETS;

type Verification = { claims: Claim[]; status: "verified" | "blocked" | "review" };
type Output = { headline: string; text: string; verification?: Verification | undefined; edited?: boolean | undefined; outdated?: boolean | undefined; dbId?: string | undefined };
type View = "text" | "image" | "audio" | "video";
type Err = { msg: string; retry?: () => void } | null;
const DRAFT_KEY = "infomorph-draft";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function Studio() {
  const navigate = useNavigate();
  const analyzeFn = useServerFn(analyzeSource);
  const generateFn = useServerFn(generateContent);
  const verifyFn = useServerFn(verifyContent);
  const compareFn = useServerFn(compareRevision);
  const audioScriptFn = useServerFn(generateAudioScript);
  const speakFn = useServerFn(synthesizeAudio);
  const storyFn = useServerFn(generateStoryboard);
  const sceneFn = useServerFn(regenerateScene);
  const videoFn = useServerFn(generateVideoClip);
  const importFn = useServerFn(importUrl);

  const [mode, setMode] = useState<"text" | "pdf" | "link">("text");
  const [source, setSource] = useState<string>(PRESETS.college);
  const [preset, setPreset] = useState<string | null>("college");
  const [sourceType, setSourceType] = useState<"text" | "pdf" | "link">("text");
  const [feedback, setFeedback] = useState("Using labelled example: College notice. Replace it with your own source.");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [settings, setSettings] = useState<Settings>({
    audience: "Technical", tone: "Professional", language: "English (US)", objective: "Inform", outputType: "Post", hook: "Statistic", voiceSample: "",
  });
  const [selected, setSelected] = useState<string[]>(PLATFORMS.map((p) => p.id));
  const [platform, setPlatform] = useState("instagram");
  const [view, setView] = useState<View>("text");

  const [analysis, setAnalysis] = useState<SourceAnalysis | null>(null);
  const [analyzedText, setAnalyzedText] = useState("");
  const [generatedFrom, setGeneratedFrom] = useState("");
  const [outputs, setOutputs] = useState<Record<string, Output>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<Err>(null);
  const [status, setStatus] = useState("● Waiting for a source");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [audio, setAudio] = useState<AudioState | null>(null);
  const [voice, setVoice] = useState("Kore");
  const [narrTone, setNarrTone] = useState("Professional");
  const [story, setStory] = useState<StoryState | null>(null);
  const [videoCfg, setVideoCfg] = useState<VideoCfg>({ format: "Instagram Reel", length: "15 seconds", aspect: "Vertical 9:16" });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState("");
  const [toast, setToast] = useState("");

  const [revOpen, setRevOpen] = useState(false);
  const [revText, setRevText] = useState("");
  const [revResult, setRevResult] = useState<{ changes: { field: string; old_value: string; new_value: string }[]; affected: string[] } | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNo, setVersionNo] = useState(1);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const artRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((s: string) => {
    setToast(s);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2700);
  }, []);

  // Auth + restore draft
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        setSource(d.source); setSettings(d.settings); setSelected(d.selected); setOutputs(d.outputs);
        setAnalysis(d.analysis); setAnalyzedText(d.analyzedText); setGeneratedFrom(d.generatedFrom); setPreset(null);
        setStatus("● Restored your unsaved work"); setFeedback("Restored your previous source.");
      } catch {}
      sessionStorage.removeItem(DRAFT_KEY);
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProjects([]); return; }
    supabase.from("projects").select("id,title").order("updated_at", { ascending: false }).limit(30)
      .then(({ data }) => setProjects(data ?? []));
  }, [user, projectId]);

  const visiblePlatforms = PLATFORMS.filter((p) => selected.includes(p.id));
  const current = outputs[platform];
  const hasOutputs = Object.keys(outputs).length > 0;
  const sourceChanged = hasOutputs && source.trim() !== generatedFrom;

  // ---------- Source input ----------
  function choosePreset(k: PresetKey) {
    setSource(PRESETS[k]); setPreset(k); setSourceType("text"); setPdfFile(null);
    setFeedback(`Using labelled example: ${k === "college" ? "College notice" : k === "event" ? "Event" : "NGO"}.`);
  }

  async function onPdf(f: File | undefined) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) { setFeedback("That file is not a PDF."); return; }
    if (f.size > 10 * 1024 * 1024) { setFeedback("PDF is larger than 10 MB. Please use a smaller file."); return; }
    setFeedback(`Reading ${f.name}…`);
    try {
      const pdfjs = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const c = await page.getTextContent();
        pages.push(c.items.map((x) => ("str" in x ? x.str : "")).join(" "));
      }
      const t = pages.join("\n").replace(/[ \t]+/g, " ").trim();
      if (t.length < 20) throw new Error("No selectable text found — this looks like a scanned PDF. Please paste its text instead.");
      setSource(t.slice(0, 30000)); setPreset(null); setSourceType("pdf"); setPdfFile(f); setMode("text");
      setFeedback(`Imported ${pdf.numPages} page(s) from ${f.name}${t.length > 30000 ? " (trimmed to 30,000 characters)" : ""}. Review the text, then morph.`);
    } catch (e) {
      setFeedback(`PDF import failed: ${errMsg(e)}`);
    }
  }

  async function onLink() {
    let u: URL;
    try { u = new URL(url.trim()); if (!["http:", "https:"].includes(u.protocol)) throw 0; } catch { setFeedback("Enter a valid http(s) link."); return; }
    setFeedback("Fetching the public page on the server…");
    try {
      const r = await importFn({ data: { url: u.href } });
      setSource(r.text); setPreset(null); setSourceType("link"); setPdfFile(null); setMode("text");
      setFeedback(`Imported text from ${new URL(r.url).hostname}. Review it before generating.`);
    } catch (e) {
      setFeedback(`Could not import this link: ${errMsg(e)}`);
    }
  }

  // ---------- Core pipeline ----------
  async function ensureAnalysis(text: string) {
    if (analysis && analyzedText === text) return analysis;
    setBusy("Extracting facts from your source…"); setStatus("● Understanding source");
    const a = await analyzeFn({ data: { text } });
    setAnalysis(a); setAnalyzedText(text);
    return a;
  }

  async function runVerify(items: { platform: string; text: string }[], text: string) {
    setBusy("Checking every claim against the source…"); setStatus("● Verifying claims");
    const v = await verifyFn({ data: { text, items } });
    setOutputs((prev) => {
      const next = { ...prev };
      for (const r of v.results) { const cur = next[r.platform]; if (cur) next[r.platform] = { ...cur, verification: { claims: r.claims, status: r.status } }; }
      return next;
    });
    return v.results;
  }

  async function morph(only?: string[]) {
    const text = source.trim();
    if (text.length < 20) { setError({ msg: "Add a source with at least a sentence or two to begin." }); return; }
    const targets = only ?? selected;
    if (!targets.length) { setError({ msg: "Select at least one output format." }); return; }
    setError(null); setEditing(false);
    try {
      const a = await ensureAnalysis(text);
      setBusy(`Writing content for ${targets.length} platform${targets.length > 1 ? "s" : ""}…`); setStatus("● Generating with AI");
      const g = await generateFn({ data: { text, analysis: a, settings, platforms: targets as never } });
      setOutputs((prev) => {
        const next = only ? { ...prev } : {};
        for (const o of g.outputs) next[o.platform] = { headline: o.headline, text: o.text, dbId: prev[o.platform]?.dbId };
        return next;
      });
      setGeneratedFrom(text);
      if (!targets.includes(platform) && g.outputs[0]) setPlatform(g.outputs[0].platform);
      const results = await runVerify(g.outputs.map((o) => ({ platform: o.platform, text: o.text })), text);
      const blocked = results.filter((r) => r.status === "blocked").length;
      setStatus(blocked ? `● ${blocked} output(s) blocked — contradiction found` : "● Generated & checked");
      notify(`Generated ${g.outputs.length} output(s) and checked their claims.`);
    } catch (e) {
      setStatus("● Generation failed");
      setError({ msg: errMsg(e), retry: () => morph(only) });
    } finally {
      setBusy("");
    }
  }

  async function reverify() {
    if (!current) return;
    setError(null);
    try {
      const r = await runVerify([{ platform, text: current.text }], generatedFrom || source.trim());
      setStatus(r[0]?.status === "blocked" ? "● Contradiction found" : "● Re-verified");
    } catch (e) {
      setError({ msg: errMsg(e), retry: reverify });
    } finally { setBusy(""); }
  }

  // ---------- Output actions ----------
  const currentText = () => (view === "audio" ? audio?.script ?? "" : view === "video" ? (story ? storyboardText(story.board) : "") : current?.text ?? "");

  async function copy() {
    const t = currentText();
    if (!t) return notify("Nothing to copy yet.");
    try { await navigator.clipboard.writeText(t); notify("Content copied"); } catch { notify("Copy unavailable in this browser"); }
  }
  function download() {
    const t = currentText();
    if (!t) return notify("Nothing to download yet.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "text/plain;charset=utf-8" }));
    a.download = `InfoMorph_${platform}${view !== "text" ? "_" + view : ""}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notify("Text file downloaded");
  }
  function startEdit() { if (!current) return; setDraft(current.text); setEditing(true); }
  function saveEdit() {
    setOutputs((p) => ({ ...p, [platform]: { headline: "", ...p[platform], text: draft, edited: true, verification: undefined } }));
    setEditing(false); setStatus("● Edited — re-verify before sharing");
  }
  async function exportImage() {
    if (!artRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const png = await toPng(artRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a"); a.href = png; a.download = `InfoMorph_${platform}_post.png`; a.click();
      notify("Post image downloaded");
    } catch (e) { notify(`Image export failed: ${errMsg(e)}`); }
  }
  const facts = () => analysis?.key_facts.map((f) => f.claim) ?? [];
  function needSource() {
    if (!generatedFrom || !analysis) { setError({ msg: "Generate content first, then create media." }); return true; }
    return false;
  }
  async function makeAudioScript() {
    if (needSource()) return;
    setError(null); setBusy("Writing audio briefing script…");
    try {
      const r = await audioScriptFn({ data: { text: generatedFrom, settings, facts: facts(), narrationTone: narrTone } });
      if (audio?.url) URL.revokeObjectURL(audio.url);
      setAudio({ title: r.title, script: r.script, voice, narrationTone: narrTone, language: settings.language, dbId: audio?.dbId });
    } catch (e) { setError({ msg: errMsg(e), retry: makeAudioScript }); } finally { setBusy(""); }
  }
  async function makeSpeech() {
    if (!audio?.script.trim()) return;
    setError(null); setBusy("Generating speech with Gemini…");
    try {
      const r = await speakFn({ data: { script: audio.script, voice: voice as "Kore", language: settings.language, narrationTone: narrTone } });
      const blob = b64Blob(r.base64, r.mimeType);
      if (audio.url) URL.revokeObjectURL(audio.url);
      setAudio({ ...audio, blob, url: URL.createObjectURL(blob), voice, narrationTone: narrTone, language: settings.language, model: r.model, filePath: undefined, audioStale: false, outdated: false });
      notify("Audio ready");
    } catch (e) { setError({ msg: `Audio generation failed: ${errMsg(e)}`, retry: makeSpeech }); } finally { setBusy(""); }
  }
  async function makeStoryboard() {
    if (needSource()) return;
    setError(null); setBusy("Building video storyboard…");
    try {
      const board = await storyFn({ data: { text: generatedFrom, settings, facts: facts(), video: videoCfg } });
      setStory({ board, cfg: videoCfg, dbId: story?.dbId }); setVideoUrl(null); setVideoErr("");
    } catch (e) { setError({ msg: errMsg(e), retry: makeStoryboard }); } finally { setBusy(""); }
  }
  function editScene(i: number, key: string, value: string) {
    setStory((s) => s && { ...s, board: { ...s.board, scenes: s.board.scenes.map((sc, j) => (j === i ? { ...sc, [key]: value } : sc)) } });
  }
  async function regenScene(i: number) {
    if (!story || needSource()) return;
    setError(null); setBusy(`Rewriting scene ${i + 1}…`);
    try {
      const sc = await sceneFn({ data: { text: generatedFrom, settings, storyboard: story.board, index: i, video: story.cfg } });
      setStory((s) => s && { ...s, board: { ...s.board, scenes: s.board.scenes.map((x, j) => (j === i ? sc : x)) } });
    } catch (e) { setError({ msg: errMsg(e), retry: () => regenScene(i) }); } finally { setBusy(""); }
  }
  async function makeVideo(i: number) {
    const sc = story?.board.scenes[i];
    if (!sc) return;
    if (!confirm("Video generation is billed to your Gemini account and can be expensive. Try generating a clip for this scene?")) return;
    setError(null); setVideoErr(""); setBusy(`Generating video for scene ${i + 1} (this can take a few minutes)…`);
    try {
      const r = await videoFn({ data: { scene: sc, aspect: story!.cfg.aspect } });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(b64Blob(r.base64, r.mimeType)));
    } catch (e) { setVideoErr(errMsg(e)); } finally { setBusy(""); }
  }

  // ---------- Revision ----------
  async function checkRevision() {
    const newText = revText.trim();
    if (newText.length < 20) return notify("Paste the revised source first.");
    if (!generatedFrom) return notify("Generate content from the original source first.");
    setError(null); setBusy("Comparing the revised source…");
    try {
      const items = Object.entries(outputs).map(([p, o]) => ({ platform: p, text: o.text }));
      if (audio) items.push({ platform: "audio_briefing", text: audio.script.slice(0, 20000) });
      if (story) items.push({ platform: "video_storyboard", text: storyboardText(story.board).slice(0, 20000) });
      const r = await compareFn({ data: { oldText: generatedFrom, newText, outputs: items.slice(0, 10) } });
      setRevResult({ changes: r.changes, affected: r.affected_platforms });
      if (r.affected_platforms.includes("audio_briefing")) setAudio((a) => a && { ...a, outdated: true });
      if (r.affected_platforms.includes("video_storyboard")) setStory((s) => s && { ...s, outdated: true });
      setOutputs((prev) => {
        const n = { ...prev };
        for (const p of r.affected_platforms) { const o = n[p]; if (o) n[p] = { ...o, outdated: true }; }
        return n;
      });
      const oldText = generatedFrom;
      setSource(newText); setPreset(null);
      setStatus(r.changes.length ? "● Source changed — review needed" : "● No factual changes detected");
      if (user && projectId) {
        const nv = versionNo + 1;
        const { data: v } = await supabase.from("source_versions").insert({ project_id: projectId, version_number: nv, source_type: "text", extracted_text: newText }).select("id").single();
        if (v) {
          await supabase.from("revision_changes").insert({ project_id: projectId, old_version_id: versionId, new_version_id: v.id, detected_changes: r.changes, affected_platforms: r.affected_platforms });
          await supabase.from("projects").update({ current_version: nv, updated_at: new Date().toISOString() }).eq("id", projectId);
          setVersionId(v.id); setVersionNo(nv);
        }
      }
      void oldText;
    } catch (e) { setError({ msg: errMsg(e), retry: checkRevision }); } finally { setBusy(""); }
  }
  async function regenerateAffected() {
    if (!revResult?.affected.length) return;
    setAnalysis(null); setAnalyzedText("");
    await morph(revResult.affected);
    setRevResult(null); setRevOpen(false); setRevText("");
  }

  // ---------- Persistence ----------
  async function save() {
    if (!hasOutputs) return notify("Generate content before saving.");
    if (!user) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ source, settings, selected, outputs, analysis, analyzedText, generatedFrom }));
      navigate({ to: "/auth" });
      return;
    }
    setBusy("Saving project…"); setError(null);
    try {
      let pid = projectId, vid = versionId;
      if (!pid) {
        const { data, error } = await supabase.from("projects").insert({ title: analysis?.title?.slice(0, 120) || "Untitled project", settings: settings as never }).select("id").single();
        if (error) throw error;
        pid = data.id; setProjectId(pid);
      } else {
        await supabase.from("projects").update({ settings: settings as never, updated_at: new Date().toISOString() }).eq("id", pid);
      }
      if (!vid) {
        let file_path: string | null = null;
        if (pdfFile && sourceType === "pdf") {
          const path = `${user.id}/${pid}/${Date.now()}.pdf`;
          const { error } = await supabase.storage.from("source-documents").upload(path, pdfFile, { contentType: "application/pdf" });
          if (error) throw error;
          file_path = path;
        }
        const { data, error } = await supabase.from("source_versions").insert({ project_id: pid!, version_number: versionNo, source_type: sourceType, extracted_text: generatedFrom, extracted_facts: analysis as never, file_path }).select("id").single();
        if (error) throw error;
        vid = data.id; setVersionId(vid);
      } else if (analysis) {
        await supabase.from("source_versions").update({ extracted_facts: analysis as never }).eq("id", vid);
      }
      const next = { ...outputs };
      for (const [p, o] of Object.entries(outputs)) {
        const row = {
          project_id: pid!, source_version_id: vid, platform: p, audience: settings.audience, tone: settings.tone, language: settings.language,
          objective: settings.objective, hook: settings.hook, headline: o.headline, generated_text: o.text,
          verification_result: (o.verification ?? null) as never, status: o.outdated ? "outdated" : o.verification?.status ?? "unverified", updated_at: new Date().toISOString(),
        };
        if (o.dbId) {
          const { error } = await supabase.from("generated_content").update(row).eq("id", o.dbId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("generated_content").insert(row).select("id").single();
          if (error) throw error;
          next[p] = { ...o, dbId: data.id };
        }
      }
      setOutputs(next);
      const base = { project_id: pid!, source_version_id: vid, audience: settings.audience, tone: settings.tone, language: settings.language, objective: settings.objective, hook: settings.hook, updated_at: new Date().toISOString() };
      const upsert = async (dbId: string | undefined, row: Record<string, unknown>) => {
        if (dbId) { const { error } = await supabase.from("generated_content").update(row as never).eq("id", dbId); if (error) throw error; return dbId; }
        const { data, error } = await supabase.from("generated_content").insert(row as never).select("id").single();
        if (error) throw error; return data.id as string;
      };
      if (audio) {
        let filePath = audio.filePath;
        if (audio.blob && !filePath) {
          filePath = `${user.id}/${pid}/audio_${Date.now()}.wav`;
          const { error } = await supabase.storage.from("generated-media").upload(filePath, audio.blob, { contentType: "audio/wav" });
          if (error) throw error;
        }
        const dbId = await upsert(audio.dbId, { ...base, platform: "audio_briefing", headline: audio.title, generated_text: audio.script, file_path: filePath ?? null,
          media_data: { voice: audio.voice, narrationTone: audio.narrationTone, language: audio.language, model: audio.model ?? null, audioStale: !!audio.audioStale },
          status: audio.outdated ? "outdated" : filePath ? "audio_ready" : "script_only" });
        setAudio((a) => a && { ...a, dbId, filePath });
      }
      if (story) {
        const dbId = await upsert(story.dbId, { ...base, platform: "video_storyboard", headline: story.board.title, generated_text: storyboardText(story.board),
          media_data: { storyboard: story.board, config: story.cfg }, status: story.outdated ? "outdated" : "storyboard" });
        setStory((s) => s && { ...s, dbId });
      }
      notify("Project saved");
    } catch (e) {
      setError({ msg: `Save failed: ${errMsg(e)}`, retry: save });
    } finally { setBusy(""); }
  }

  async function loadProject(id: string) {
    if (!id) return;
    setBusy("Loading project…"); setError(null);
    try {
      const { data: p, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: v } = await supabase.from("source_versions").select("*").eq("project_id", id).order("version_number", { ascending: false }).limit(1).single();
      const { data: rows } = await supabase.from("generated_content").select("*").eq("project_id", id).order("updated_at", { ascending: false });
      const outs: Record<string, Output> = {};
      let au: AudioState | null = null, st: StoryState | null = null;
      for (const r of rows ?? []) {
        const md = (r.media_data ?? {}) as { voice?: string; narrationTone?: string; language?: string; audioStale?: boolean; storyboard?: Storyboard; config?: VideoCfg };
        if (r.platform === "audio_briefing") {
          if (au) continue;
          au = { title: r.headline ?? "", script: r.generated_text, voice: String(md.voice ?? "Kore"), narrationTone: String(md.narrationTone ?? "Professional"), language: String(md.language ?? r.language ?? ""),
            filePath: r.file_path ?? undefined, outdated: r.status === "outdated", audioStale: !!md.audioStale, dbId: r.id };
          if (r.file_path) {
            const { data: f } = await supabase.storage.from("generated-media").download(r.file_path);
            if (f) { const blob = new Blob([f], { type: "audio/wav" }); au.blob = blob; au.url = URL.createObjectURL(blob); }
          }
          continue;
        }
        if (r.platform === "video_storyboard") {
          if (st || !md.storyboard) continue;
          st = { board: md.storyboard as Storyboard, cfg: (md.config as VideoCfg) ?? videoCfg, outdated: r.status === "outdated", dbId: r.id };
          continue;
        }
        if (outs[r.platform]) continue;
        outs[r.platform] = { headline: r.headline ?? "", text: r.generated_text, verification: (r.verification_result as Verification | null) ?? undefined, outdated: r.status === "outdated", dbId: r.id };
      }
      setAudio(au); setStory(st); setVideoUrl(null); setVideoErr("");
      if (au) { setVoice(au.voice); setNarrTone(au.narrationTone); }
      if (st) setVideoCfg(st.cfg);
      setProjectId(id); setVersionId(v?.id ?? null); setVersionNo(v?.version_number ?? 1);
      if (p.settings && typeof p.settings === "object") setSettings((s) => ({ ...s, ...(p.settings as Partial<Settings>) }));
      const text = v?.extracted_text ?? "";
      setSource(text); setGeneratedFrom(text); setPreset(null);
      const facts = v?.extracted_facts as SourceAnalysis | null;
      setAnalysis(facts); setAnalyzedText(facts ? text : "");
      setOutputs(outs); setSelected(PLATFORMS.map((x) => x.id)); setPlatform(Object.keys(outs)[0] ?? "instagram");
      setFeedback(`Loaded saved project “${p.title}” (version ${v?.version_number ?? 1}).`); setStatus("● Loaded saved project");
    } catch (e) { setError({ msg: `Could not load project: ${errMsg(e)}` }); } finally { setBusy(""); }
  }
  function newProject() {
    setProjectId(null); setVersionId(null); setVersionNo(1); setOutputs({}); setAnalysis(null); setAnalyzedText(""); setGeneratedFrom("");
    setAudio(null); setStory(null); setVideoUrl(null); setVideoErr("");
    setRevResult(null); setStatus("● Waiting for a source");
  }

  // ---------- Render helpers ----------
  const v = current?.verification;
  const badge = !current ? null : current.outdated ? (
    <span className="vbadge vb-blocked">⚠ Outdated — source changed. Regenerate.</span>
  ) : !v ? (
    <span className="vbadge vb-unchecked">○ Not verified{current.edited ? " — edited after generation" : ""}</span>
  ) : v.status === "verified" ? (
    <span className="vbadge vb-verified">✓ All {v.claims.length} claims supported by source</span>
  ) : v.status === "blocked" ? (
    <span className="vbadge vb-blocked">✕ Contradiction found — not approved for sharing</span>
  ) : (
    <span className="vbadge vb-review">! Needs human review</span>
  );

  const viewNotice =
    view === "image" ? "Designed post graphic built from the generated headline. This is a typographic layout, not AI imagery — download it as a PNG."
    : view === "audio" ? "Write a narration script from your source, edit it, then turn it into real speech with Gemini. Download it as a WAV file."
    : view === "video" ? "Build a scene-by-scene storyboard. Video clips only work if your Gemini account has video generation access."
    : "";

  return (
    <div className="studio-page">
      <div className="studio-nav">
        <Link className="brand" to="/"><span className="brandmark"><span></span></span>InfoMorph</Link>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {user ? (
            <>
              {projects.length > 0 && (
                <select className="project-select" aria-label="Saved projects" value={projectId ?? ""} onChange={(e) => (e.target.value ? loadProject(e.target.value) : newProject())}>
                  <option value="">+ New project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}
              <button className="small-btn secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </>
          ) : (
            <Link className="back" to="/auth">Sign in to save</Link>
          )}
          <Link className="back" to="/">← Back to website</Link>
        </div>
      </div>
      <section className="lab" id="studio"><div className="wrap">
        <div className="lab-shell reveal visible">
          <div className="lab-top">
            <div className="window-dots"><i></i><i></i><i></i></div>
            <strong style={{ font: "700 13px 'Space Grotesk'" }}>✦ InfoMorph / Content Studio</strong>
            <span style={{ fontSize: 11, color: "#817b93" }}>{projectId ? `SAVED PROJECT • V${versionNo}` : "AI-POWERED • UNSAVED"}</span>
          </div>
          <div className="lab-content">
            <aside className="lab-sidebar">
              <span className="step-label">01 / YOUR SOURCE</span>
              <h3>Start with the truth.</h3>
              <div className="source-modes">
                {(["text", "pdf", "link"] as const).map((m) => (
                  <button key={m} className={`source-mode${mode === m ? " active" : ""}`} type="button" onClick={() => setMode(m)}>
                    {m === "text" ? "✎ Text" : m === "pdf" ? "↑ PDF" : "↗ Link"}
                  </button>
                ))}
              </div>
              <div id="inputText" hidden={mode !== "text"}>
                <textarea aria-label="Source announcement" className="source" value={source}
                  onChange={(e) => { setSource(e.target.value); setPreset(null); if (sourceType !== "text" && !pdfFile) setSourceType("text"); }} />
                <div className="presets">
                  <span style={{ fontSize: 10, color: "#807b9a", fontWeight: 800, alignSelf: "center" }}>EXAMPLES:</span>
                  <button className={`chip${preset === "college" ? " active" : ""}`} type="button" onClick={() => choosePreset("college")}>🎓 College notice</button>
                  <button className={`chip${preset === "event" ? " active" : ""}`} type="button" onClick={() => choosePreset("event")}>🎤 Event</button>
                  <button className={`chip${preset === "ngo" ? " active" : ""}`} type="button" onClick={() => choosePreset("ngo")}>🌱 NGO</button>
                </div>
              </div>
              <div id="inputPdf" hidden={mode !== "pdf"}>
                <label className="drop-zone" htmlFor="pdfFile">↑<strong>Choose a PDF</strong><small>Text-based PDFs up to 10 MB</small></label>
                <input accept="application/pdf,.pdf" hidden id="pdfFile" type="file" onChange={(e) => { onPdf(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div id="inputLink" hidden={mode !== "link"}>
                <label className="form-label" htmlFor="sourceUrl">PASTE A PUBLIC WEBPAGE LINK</label>
                <input className="input-line" id="sourceUrl" placeholder="https://example.com/announcement" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button className="small-btn" style={{ marginTop: 10 }} type="button" onClick={onLink}>Import webpage text ↗</button>
              </div>
              <div className="source-feedback" role="status">{feedback}</div>

              <div className="configuration">
                <span className="step-label">02 / TAILOR YOUR CONTENT</span>
                <Sel id="audience" label="Who is your audience?" value={settings.audience} onChange={(x) => setSettings({ ...settings, audience: x })} options={["Technical", "General", "Entrepreneurship", "Students", "Professionals"]} />
                <Sel id="tone" label="What tone do you prefer?" value={settings.tone} onChange={(x) => setSettings({ ...settings, tone: x })} options={["Professional", "Bold & Punchy", "Storytelling", "Witty", "Inspirational", "Contrarian", "Informative", "Conversational", "Educational", "Friendly", "Urgent"]} />
                <Sel id="language" label="What language should I use?" value={settings.language} onChange={(x) => setSettings({ ...settings, language: x })} options={["English (US)", "Hindi", "Telugu"]} />
                <Sel id="objective" label="What is your objective?" value={settings.objective} onChange={(x) => setSettings({ ...settings, objective: x })} options={["Inform", "Educate", "Engage", "Summarize"]} />
                <Sel id="outputType" label="Output type" value={settings.outputType}
                  onChange={(x) => { setSettings({ ...settings, outputType: x }); setView(x === "Audio" ? "audio" : x === "Video" ? "video" : "text"); }} options={["Post", "Audio", "Video"]} />
                <Sel id="hook" label="Opening hook style" value={settings.hook} onChange={(x) => setSettings({ ...settings, hook: x })} options={["Question", "Statistic", "Story", "Myth-busting"]} />
                <label className="form-label" htmlFor="voiceSample">Writing voice sample (optional)</label>
                <textarea className="source voice-sample" id="voiceSample" placeholder="Paste 1–2 paragraphs of your writing..." value={settings.voiceSample} maxLength={3000} onChange={(e) => setSettings({ ...settings, voiceSample: e.target.value })} />
                <span className="form-label">Output formats</span>
                <div className="format-options">
                  {PLATFORMS.map((p) => (
                    <label key={p.id}>
                      <input type="checkbox" checked={selected.includes(p.id)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id);
                          setSelected(next);
                          if (!next.includes(platform) && next.length) setPlatform(next[0]!);
                        }} /> {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <button className="generate" onClick={() => morph()} disabled={!!busy}>{busy ? "Working…" : hasOutputs ? "✦ Regenerate with these settings ↗" : "✦ Morph this information ↗"}</button>
              <div className="demo-note">Content is generated by AI from your source, then every factual claim is checked against it. AI checks are not guarantees — always review flagged claims.</div>
            </aside>

            <main className="lab-main">
              <div className="lab-heading">
                <h3>Generated Outputs</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="status" role="status">{busy ? `● ${busy}` : status}</span>
                  <button className="small-btn" onClick={save} disabled={!!busy || !hasOutputs}>{user ? "💾 Save project" : "💾 Sign in to save"}</button>
                </div>
              </div>
              {error && (
                <div className="error-box" role="alert"><span>⚠ {error.msg}</span>{error.retry && <button className="small-btn" onClick={error.retry} disabled={!!busy}>Retry</button>}</div>
              )}
              {sourceChanged && !revResult && <div className="view-notice" style={{ marginTop: 12 }}>The source has changed since these outputs were generated. Regenerate to update them.</div>}

              <div aria-label="Content platform" className="tabs" role="tablist">
                {visiblePlatforms.map((p) => (
                  <button key={p.id} role="tab" aria-selected={platform === p.id}
                    className={`tab${platform === p.id ? " active" : ""}${outputs[p.id]?.outdated ? " outdated" : ""}`}
                    onClick={() => { setPlatform(p.id); setEditing(false); }}>{p.label}</button>
                ))}
              </div>

              <div className="preview-wrap">
                {!hasOutputs ? (
                  <div className="empty-state">
                    {busy ? busy : <>Nothing generated yet. Add your source, pick platforms, and click <b>Morph this information</b>.</>}
                  </div>
                ) : (
                  <div className="preview">
                    <div aria-label="Output view" className="media-tabs">
                      {(["text", "image", "audio", "video"] as View[]).map((x) => (
                        <button key={x} type="button" className={`media-tab${view === x ? " active" : ""}`} onClick={() => setView(x)}>
                          {x === "text" ? "▤ Text Copy" : x === "image" ? "▧ Post Image" : x === "audio" ? "◉ Audio Briefing" : "▣ Video Studio"}
                        </button>
                      ))}
                    </div>
                    {viewNotice && <div className="view-notice">{viewNotice}</div>}
                    <div className="social-head">
                      <div className="avatar"></div>
                      <div><strong>InfoMorph Studio • {platformLabel(platform)}</strong><div style={{ color: "#9893a6", fontSize: 11 }}>{current ? `${settings.language} • ${current.edited ? "Edited" : "AI-generated"}` : "Not generated for this platform"}</div></div>
                    </div>

                    {!current ? (
                      <div className="preview-text" style={{ marginTop: 16 }}>No content for this platform yet. <button className="small-btn" onClick={() => morph([platform])} disabled={!!busy}>Generate it ↗</button></div>
                    ) : view === "audio" ? (
                      <AudioPanel audio={audio} busy={!!busy} language={settings.language} voice={voice} setVoice={setVoice} tone={narrTone} setTone={setNarrTone}
                        onScript={makeAudioScript} onSpeak={makeSpeech} onEdit={(script) => setAudio((a) => a && { ...a, script, audioStale: !!a.url })} />
                    ) : view === "video" ? (
                      <StoryboardPanel story={story} busy={!!busy} cfg={videoCfg} setCfg={setVideoCfg} onGenerate={makeStoryboard} onEditScene={editScene}
                        onRegenScene={regenScene} onVideo={makeVideo} videoUrl={videoUrl} videoErr={videoErr} notify={notify} />
                    ) : (
                      <>
                        <div className="preview-art" ref={artRef}><h4>{current.headline || platformLabel(platform)}</h4></div>
                        {view === "image" ? (
                          <div className="preview-actions"><button className="small-btn" onClick={exportImage}>↓ Download post image (.png)</button></div>
                        ) : editing ? (
                          <>
                            <textarea className="inline-editor" aria-label="Edit generated copy" value={draft} onChange={(e) => setDraft(e.target.value)} />
                            <div className="preview-actions">
                              <button className="small-btn" onClick={saveEdit}>✓ Save edit</button>
                              <button className="small-btn secondary" onClick={() => setEditing(false)}>Cancel</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div aria-live="polite" className="preview-text">{current.text}</div>
                            {badge}
                            <div className="preview-actions">
                              <button className="small-btn" onClick={copy}>⧉ Copy content</button>
                              <button className="small-btn secondary" onClick={download}>↓ Download .txt</button>
                              <button className="small-btn secondary" onClick={startEdit}>✎ Edit copy</button>
                              <button className="small-btn secondary" onClick={reverify} disabled={!!busy}>🛡 {v ? "Re-verify" : "Verify claims"}</button>
                              <button className="small-btn secondary" onClick={() => morph([platform])} disabled={!!busy}>↻ Regenerate</button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {current && view === "text" && (
                <div className="evidence evidence-panel">
                  <h4>🛡 Evidence check — {platformLabel(platform)}</h4>
                  {!v ? (
                    <div className="fact"><strong>Not verified yet</strong><span>{current.edited ? "This copy was edited. Re-verify it before sharing." : "Run verification to check claims."}</span></div>
                  ) : v.claims.length === 0 ? (
                    <div className="fact"><strong>No factual claims were identified</strong><span>Review manually before sharing.</span></div>
                  ) : (
                    v.claims.map((c, i) => (
                      <div className="fact" key={i}>
                        <strong><span>{c.claim}</span><span className={`cstat ${c.status.split(" ")[0]}`}>{c.status.toUpperCase()}</span></strong>
                        {c.source_quote && <span>Source: “{c.source_quote}”</span>}
                        {c.explanation && <div style={{ color: "#8a8499", marginTop: 4 }}>{c.explanation}</div>}
                      </div>
                    ))
                  )}
                  {analysis && (
                    <div className="verify-note">
                      <b>Source facts ({analysis.key_facts.length}):</b> {analysis.key_facts.map((f) => f.claim + (f.quote_verified ? "" : " (⚠ quote not found — review)")).join(" • ")}
                      {analysis.ambiguities.length > 0 && <><br /><b>Ambiguities:</b> {analysis.ambiguities.join(" • ")}</>}
                    </div>
                  )}
                </div>
              )}

              <div className="revision">
                <div className="revision-top">
                  <div>
                    <h4>🔄 What if the source changes?</h4>
                    <p>Paste a revised source to detect changed facts and find content that needs updating.</p>
                  </div>
                  <button className="small-btn" onClick={() => { setRevOpen(!revOpen); if (!revText) setRevText(generatedFrom || source); }} disabled={!hasOutputs}>
                    {revOpen ? "Close" : "Try a revision ↗"}
                  </button>
                </div>
                {revOpen && (
                  <div style={{ marginTop: 12 }}>
                    <textarea className="source" aria-label="Revised source" style={{ minHeight: 120 }} value={revText} onChange={(e) => setRevText(e.target.value)} />
                    <button className="small-btn" style={{ marginTop: 8 }} onClick={checkRevision} disabled={!!busy}>Compare with original ↗</button>
                  </div>
                )}
                {revResult && (
                  <div className="diff">
                    {revResult.changes.length === 0 ? (
                      <strong>No factual changes detected between the versions.</strong>
                    ) : (
                      revResult.changes.map((c, i) => (
                        <div key={i}><strong>{c.field}:</strong> <del>{c.old_value || "—"}</del> → <ins>{c.new_value || "(removed)"}</ins></div>
                      ))
                    )}
                    {revResult.changes.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Affected outputs:</strong> {revResult.affected.length ? revResult.affected.map(platformLabel).join(", ") : "none of the generated outputs mention the changed facts"}
                        {revResult.affected.length > 0 && <button className="small-btn" style={{ marginLeft: 10 }} onClick={regenerateAffected} disabled={!!busy}>Regenerate affected now</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div></section>
      <div className={`toast${toast ? " show" : ""}`} role="status">{toast}</div>
    </div>
  );
}

function Sel({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <>
      <label className="form-label" htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </>
  );
}
