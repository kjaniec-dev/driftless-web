// Generates public/THIRD-PARTY-NOTICES.txt: the licence text of every dependency that ends up in
// the production bundle (Apache-2.0 and MIT both require the notice to travel with the code).
//
//   node scripts/third-party-notices.mjs          write the file
//   node scripts/third-party-notices.mjs --check  fail if the committed file is out of date
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public", "THIRD-PARTY-NOTICES.txt");

const json = execFileSync(
  "npx",
  [
    "--no-install",
    "license-checker-rseidelsohn",
    "--production",
    "--excludePrivatePackages",
    "--json",
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);
const packages = Object.entries(JSON.parse(json)).sort(([a], [b]) => a.localeCompare(b));

const sections = packages.map(([name, info]) => {
  const file = info.licenseFile;
  // Some packages ship no licence file, so the tool falls back to their README: not a licence text.
  const isLicenceFile = file && fs.existsSync(file) && !/readme/i.test(path.basename(file));
  const body = isLicenceFile
    ? fs.readFileSync(file, "utf8").trim()
    : `Declared licence: ${info.licenses} (package.json). This package ships no separate licence file.${info.publisher ? `\nPublisher: ${info.publisher}` : ""}`;
  return [
    name,
    `License: ${info.licenses}`,
    info.repository ? `Source: ${info.repository}` : null,
    "",
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
});

const output = `Driftless Web includes the following third-party software.\nThe application itself is MIT licensed (see LICENSE).\n\n${sections.join(`\n\n${"-".repeat(72)}\n\n`)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== output) {
    console.error(
      "public/THIRD-PARTY-NOTICES.txt is out of date: run `npm run licenses:notices` and commit it.",
    );
    process.exit(1);
  }
  console.log(`THIRD-PARTY-NOTICES.txt is up to date (${packages.length} packages).`);
} else {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)} (${packages.length} packages)`);
}
