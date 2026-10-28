InfoMorph

Evidence-aware content transformation for institutional communication.

InfoMorph adapts a supplied source into ten channel formats, checks generated claims against source text and identifies drafts affected by source revisions. Human review remains part of the workflow.

Repository and snapshot

https://github.com/snehakapilavayi/informorph1.0

Submission baseline: ade06957d4ebbc9e84c14e2d68e877ec2da94136

Stack

React 19, TypeScript, TanStack Start/Router, Vite, Tailwind CSS, custom CSS, Radix-based UI, Gemini API, Supabase Auth/PostgreSQL/Storage, Zod and PDF.js.

Features

Paste source text, extract text from PDFs or import a readable web page.

Generate copy for Instagram, WhatsApp, LinkedIn, blogs, YouTube, X and email, with ten format options in total.

Choose audience, tone, language, objective and writing style.

Review factual claims alongside supporting source quotations.

Compare revised sources and identify affected drafts.

Edit and re-verify copy, download text and export typographic post graphics.

Sign in to save and reopen projects.

Generate audio scripts and video storyboards. Speech and video integrations require account-supported models and live validation.

Quick start

Use Node.js 22.12+ or 24 and npm. A Gemini API key and configured Supabase project are required for the full workflow.

git clone https://github.com/snehakapilavayi/informorph1.0.git
cd informorph1.0
npm ci
cp .env.example .env
# Set your Supabase values and private server-side GEMINI_API_KEY.
# Set INFOMORPH_MODEL to an account-accessible text model.
npm run dev

On Windows, copy the template with Copy-Item .env.example .env. Apply the supplied SQL migrations and create the private storage buckets before testing saves. See docs/03_Installation_Guide.md for the full procedure.

Environment configuration

Variable

Purpose

GEMINI_API_KEY

Private server credential for Gemini requests

INFOMORPH_MODEL

Optional text model override; choose an account-accessible model

VITE_SUPABASE_URL

Public Supabase project URL for the browser

VITE_SUPABASE_PUBLISHABLE_KEY

Public Supabase publishable key

SUPABASE_URL

Supabase URL for server helpers

SUPABASE_PUBLISHABLE_KEY

Supabase publishable key for server helpers

INFOMORPH_TTS_MODEL

Optional speech model override

INFOMORPH_VIDEO_MODEL

Optional video model override

Create private Storage buckets named source-documents and generated-media. On a fresh Supabase project, apply the SQL files in drizzle/migrations in filename order. Configure authentication redirects for the local or deployed origin. Google sign-in uses the Lovable cloud-auth helper and requires its supported configuration.

Routes

/ redirects to the cinematic story page. /studio opens the working content studio. /auth opens account sign-in/sign-up. Generation uses server functions, so a compatible backend runtime is required.

Commands

Command

Purpose

npm run dev

Start the development server

npm run build

Build the application

npm run preview

Preview the build

npm test

Run Vitest tests

npm run lint

Run ESLint

Demo workflow

Open /studio and use the built-in college notice or your own source.

Select WhatsApp, Instagram and email, then generate drafts.

Inspect the claim evidence panel and review critical facts.

Supply a revised notice with a changed deadline.

Compare revisions, regenerate affected drafts and review the result.

Export the content or sign in to save the project.

Main files

src/routes/studio.tsx implements Studio. src/lib/infomorph.functions.ts implements validated server functions. src/lib/ai.server.ts connects to Gemini. src/lib/verify.ts contains deterministic checks. src/lib/clean-text.ts cleans generated formatting. drizzle/migrations contains database SQL. public/story contains the landing experience.

Deliverables

docs/00_Submission_Checklist.md lists all deliverables and outstanding live checks. The documentation package includes BRD, architecture, installation, feature list, business use case, roadmap, demo script and validation report. The presentation is InfoMorph_Hackathon_Pitch.pptx.

Prototype limits

Verified means checked against supplied source text. It does not prove source authenticity. Scanned PDFs need OCR, automatic social publishing is planned, and media calls depend on account/model support. Build and live API checks remain pending in this environment. See docs/08_Validation_Report.md.

Credentials

Use private server environment secrets for Gemini. Never put private keys in VITE_ variables or commit real .env files. Public Supabase configuration is separate from private service credentials.
The link for accessing the actual web page is https://informorph10.vercel.app/
