// electron-builder never copies node_modules folders inside extraResources, so the Next.js server's own
// node_modules (from the standalone build) is copied here, after packing and before the installer is made.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const from = path.join(__dirname, "..", ".next", "standalone", "node_modules");
  const to = path.join(resources, "app-server", "node_modules");
  if (!fs.existsSync(from)) throw new Error("Standalone node_modules missing — run `npm run desktop:prepare` first.");
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, dereference: true });
  console.log("  • copied server node_modules →", to);
};
