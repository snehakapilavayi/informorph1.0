import { useState } from "react";
import type { Storyboard } from "@/lib/infomorph.functions";

export type AudioState = {
  title: string; script: string; voice: string; narrationTone: string; language: string;
  url?: string | undefined; blob?: Blob | undefined; filePath?: string | undefined; model?: string | undefined;
  outdated?: boolean | undefined; dbId?: string | undefined; audioStale?: boolean | undefined;
};
export type VideoCfg = { format: string; length: string; aspect: string };
export type StoryState = { board: Storyboard; cfg: VideoCfg; outdated?: boolean | undefined; dbId?: string | undefined };

export const VOICES = ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda"] as const;
export const NARRATION_TONES = ["Professional", "Friendly", "Energetic", "Calm"];
export const VIDEO_FORMATS = ["Instagram Reel", "YouTube Short", "Educational Explainer", "Promotional Announcement", "Institutional Update"];

export function storyboardText(sb: Storyboard): string {
  return [
    sb.title, `Objective: ${sb.objective}`, `Hook: ${sb.hook}`, "",
    ...sb.scenes.map((s, i) =>
      `SCENE ${i + 1}: ${s.title.toUpperCase()}\nDuration: ${s.duration}\nVisual: ${s.visual}\nCamera / animation: ${s.camera}\nOn-screen text: ${s.on_screen_text}\nVoiceover: ${s.voiceover}\nTransition: ${s.transition}\n`),
    `Music: ${sb.music}`, `Call to action: ${sb.cta}`, `Total duration: ${sb.total_duration}`,
  ].join("\n");
}
export const voiceoverScript = (sb: Storyboard) => sb.scenes.map((s) => s.voiceover).filter(Boolean).join("\n");

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

const field = { width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "inherit", padding: 8, font: "inherit", fontSize: 13 } as const;
const row = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 14 } as const;

export function AudioPanel(p: {
  audio: AudioState | null; busy: boolean; language: string;
  voice: string; setVoice: (v: string) => void; tone: string; setTone: (v: string) => void;
  onScript: () => void; onSpeak: () => void; onEdit: (script: string) => void;
}) {
  const a = p.audio;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={row}>
        <label className="form-label">Voice<select style={field} value={p.voice} onChange={(e) => p.setVoice(e.target.value)}>{VOICES.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="form-label">Narration tone<select style={field} value={p.tone} onChange={(e) => p.setTone(e.target.value)}>{NARRATION_TONES.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="form-label">Language<input style={field} value={p.language} readOnly title="Change language in the settings panel" /></label>
      </div>
      {a?.outdated && <span className="vbadge vb-blocked" style={{ marginTop: 12 }}>⚠ Outdated: source facts changed. Regenerate the script and audio.</span>}
      {a ? (
        <>
          <label className="form-label" style={{ marginTop: 14, display: "block" }}>Narration script (editable)</label>
          <textarea className="inline-editor" aria-label="Audio script" value={a.script} onChange={(e) => p.onEdit(e.target.value)} />
        </>
      ) : <div className="preview-text" style={{ marginTop: 14 }}>No audio script yet. Write one from your source, review it, then turn it into speech.</div>}
      {a?.url && (
        <div style={{ marginTop: 12 }}>
          <audio controls src={a.url} style={{ width: "100%" }} aria-label="Generated audio briefing" />
          {a.audioStale && <div className="view-notice" style={{ marginTop: 6 }}>The script changed after this audio was made. Generate audio again to match.</div>}
        </div>
      )}
      <div className="preview-actions">
        <button className="small-btn" onClick={p.onScript} disabled={p.busy}>{a ? "↻ Regenerate script" : "◉ Write audio script"}</button>
        {a && <button className="small-btn" onClick={p.onSpeak} disabled={p.busy || !a.script.trim()}>{a.url ? "↻ Regenerate audio" : "▶ Generate audio"}</button>}
        {a?.blob && <button className="small-btn secondary" onClick={() => saveBlob(a.blob!, "InfoMorph_audio_briefing.wav")}>↓ Download audio (.wav)</button>}
        {a && <button className="small-btn secondary" onClick={() => saveBlob(new Blob([a.script], { type: "text/plain" }), "InfoMorph_audio_script.txt")}>↓ Script .txt</button>}
      </div>
    </div>
  );
}

export function StoryboardPanel(p: {
  story: StoryState | null; busy: boolean; cfg: VideoCfg; setCfg: (c: VideoCfg) => void;
  onGenerate: () => void; onEditScene: (i: number, key: string, value: string) => void; onRegenScene: (i: number) => void;
  onVideo: (i: number) => void; videoUrl: string | null; videoErr: string; notify: (s: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const s = p.story;
  const sel = (k: keyof VideoCfg, opts: string[], label: string) => (
    <label className="form-label">{label}<select style={field} value={p.cfg[k]} onChange={(e) => p.setCfg({ ...p.cfg, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={row}>
        {sel("format", VIDEO_FORMATS, "Format")}
        {sel("length", ["15 seconds", "30 seconds", "60 seconds"], "Length")}
        {sel("aspect", ["Vertical 9:16", "Horizontal 16:9"], "Aspect")}
      </div>
      {s?.outdated && <span className="vbadge vb-blocked" style={{ marginTop: 12 }}>⚠ Outdated: source facts changed. Regenerate the storyboard.</span>}
      {!s ? <div className="preview-text" style={{ marginTop: 14 }}>No storyboard yet. Pick a format and build one from your source.</div> : (
        <>
          <div className="preview-text" style={{ marginTop: 14 }}>
            <b>{s.board.title}</b><br />Objective: {s.board.objective}<br />Hook: {s.board.hook}<br />Total: {s.board.total_duration} • {s.cfg.format} • {s.cfg.aspect}
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {s.board.scenes.map((sc, i) => (
              <div key={i} className="fact" style={{ display: "block" }}>
                <strong><span>Scene {i + 1}: {sc.title}</span><span className="cstat Supported">{sc.duration}</span></strong>
                {editing === i ? (
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {(["title", "duration", "visual", "camera", "on_screen_text", "voiceover", "transition"] as const).map((k) => (
                      <label key={k} className="form-label" style={{ fontSize: 11 }}>{k.replace(/_/g, " ")}
                        <textarea style={{ ...field, minHeight: k === "visual" || k === "voiceover" ? 56 : 32 }} value={sc[k]} onChange={(e) => p.onEditScene(i, k, e.target.value)} />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>
                    <div><b>Visual:</b> {sc.visual}</div>
                    <div><b>Camera:</b> {sc.camera}</div>
                    <div><b>On-screen:</b> “{sc.on_screen_text}”</div>
                    <div><b>Voiceover:</b> {sc.voiceover}</div>
                    {sc.transition && <div style={{ color: "#8a8499" }}>Transition: {sc.transition}</div>}
                  </div>
                )}
                <div className="preview-actions" style={{ marginTop: 8 }}>
                  <button className="small-btn secondary" onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? "✓ Done" : "✎ Edit scene"}</button>
                  <button className="small-btn secondary" onClick={() => p.onRegenScene(i)} disabled={p.busy}>↻ Regenerate scene</button>
                  <button className="small-btn secondary" onClick={() => p.onVideo(i)} disabled={p.busy}>▣ Generate video clip</button>
                </div>
              </div>
            ))}
          </div>
          <div className="preview-text" style={{ marginTop: 12 }}><b>Music:</b> {s.board.music}<br /><b>Call to action:</b> {s.board.cta}</div>
          <div className="preview-text" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}><b>Full voiceover script</b><br />{voiceoverScript(s.board)}</div>
          {p.videoErr && <div className="view-notice" style={{ marginTop: 10 }}>Video generation unavailable: {p.videoErr}</div>}
          {p.videoUrl && <video controls src={p.videoUrl} style={{ width: "100%", marginTop: 10, borderRadius: 12 }} />}
        </>
      )}
      <div className="preview-actions">
        <button className="small-btn" onClick={p.onGenerate} disabled={p.busy}>{s ? "↻ Regenerate storyboard" : "▣ Build storyboard"}</button>
        {s && <>
          <button className="small-btn secondary" onClick={async () => { try { await navigator.clipboard.writeText(voiceoverScript(s.board)); p.notify("Script copied"); } catch { p.notify("Copy unavailable"); } }}>⧉ Copy script</button>
          <button className="small-btn secondary" onClick={() => saveBlob(new Blob([storyboardText(s.board)], { type: "text/plain" }), "InfoMorph_storyboard.txt")}>↓ Storyboard .txt</button>
          <button className="small-btn secondary" onClick={() => saveBlob(new Blob([JSON.stringify({ ...s.board, config: s.cfg }, null, 2)], { type: "application/json" }), "InfoMorph_storyboard.json")}>↓ JSON</button>
        </>}
      </div>
    </div>
  );
}
