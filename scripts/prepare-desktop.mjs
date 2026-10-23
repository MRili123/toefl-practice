// Completes the Next.js standalone server for the desktop app: copies the static assets and public/
// (test media) next to server.js, as the Next docs require for standalone output, and makes sure no
// local secrets or user data ended up in it.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Run `next build` first (output: standalone).");
  process.exit(1);
}

const copy = (from, to) => {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
};
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(root, "public"), path.join(standalone, "public"));

// Never ship secrets or the developer's own progress.
for (const name of fs.readdirSync(standalone)) {
  // Keep only what the server needs at runtime: server.js, .next, node_modules, public, package.json.
  const runtime = ["server.js", ".next", "node_modules", "public", "package.json"];
  if (!runtime.includes(name)) {
    fs.rmSync(path.join(standalone, name), { recursive: true, force: true });
    console.log("removed", name);
  }
}
for (const required of ["build/stt/stt_server", "practice_audios", "data/bank", "content/exercises"]) {
  if (!fs.existsSync(path.join(root, required))) console.warn(`warning: ${required} is missing`);
}
console.log("Standalone server ready:", standalone);
