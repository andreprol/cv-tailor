/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Next's default Server Action body cap is 1MB — too small for a
      // scanned/photographed CV PDF or DOCX (often 1-5MB) and for a decent
      // phone screenshot of a job posting, both of which are submitted via
      // Server Actions in this app (uploadCvAction, createApplicationAction).
      // 10MB comfortably covers realistic files while still bounding abuse.
      bodySizeLimit: '10mb',
    },
  },
}
export default nextConfig
