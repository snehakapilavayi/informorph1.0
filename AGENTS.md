<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## InfoMorph architecture
- UI styles live in `src/infomorph.css`, ported verbatim from the user's approved HTML designs; Studio-only overrides are nested under `.studio-page` so they don't leak into the landing page. Don't redesign — the HTML files are the source of truth.
- All AI calls (analyze, generate, verify, compare revision, media scripts) go through server functions in `src/lib/infomorph.functions.ts` → `src/lib/ai.server.ts` (Lovable AI Gateway with `LOVABLE_API_KEY`; text calls fall through a model list on quota/rate-limit errors; overridable via `INFOMORPH_MODEL`, `INFOMORPH_TTS_MODEL`, `INFOMORPH_VIDEO_MODEL`). Generated copy passes through `src/lib/clean-text.ts`. Audio/storyboard rows live in `generated_content` (platform `audio_briefing`/`video_storyboard`, `media_data` jsonb, `file_path` in private `generated-media` bucket). Keeps keys server-side.
- Deterministic fact checks in `src/lib/verify.ts` can only downgrade AI verdicts, never upgrade them; covered by `verify.test.ts`.
- Persistence uses the browser client with per-user RLS (projects, source_versions, generated_content, revision_changes, private `source-documents` bucket keyed by user id folder).
