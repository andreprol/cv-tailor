/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Next's default Server Action body cap is 1MB — too small for a
      // scanned/photographed CV PDF or DOCX (often 1-5MB) and for a decent
      // phone screenshot of a job posting, both of which are submitted via
      // Server Actions in this app (uploadCvAction, createApplicationAction).
      // Capped at 4mb (not higher) because Vercel's Serverless Functions
      // (Node.js runtime, which Server Actions run on) enforce a HARD
      // platform-level request body limit of 4.5MB that this setting cannot
      // override — going above it would pass Next's own check just to fail
      // with an opaque platform 413 later. Client-side checks in
      // upload-cv-form.tsx and applications/new/page.tsx reject oversized
      // files before they ever reach this limit.
      bodySizeLimit: '4mb',
    },
  },
}
export default nextConfig
