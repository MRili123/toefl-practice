import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the desktop app (`.next/standalone/server.js`).
  output: "standalone",
  outputFileTracingIncludes: {
    // Read at runtime through process.cwd()/node_modules by the spell checker.
    "/*": ["./node_modules/dictionary-en/**/*", "./node_modules/dictionary-en-gb/**/*"],
  },
  outputFileTracingExcludes: {
    // User data, secrets and large assets are shipped (or kept) separately — never traced into the server bundle.
    "/*": [
      "./data/**/*",
      "./.env*",
      "./practice_audios/**/*",
      "./content/**/*",
      "./public/**/*",
      "./stt/**/*",
      "./desktop/**/*",
      "./dist-desktop/**/*",
      "./build/**/*",
      "./scripts/**/*",
    ],
  },
};

export default nextConfig;
