import path from "node:path";
import { cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "../build");

await rm(buildDir, { force: true, recursive: true });

await mkdir(buildDir);

const containerDistDir = path.join(__dirname, "../node_modules/@next-core/brick-container/dist");

await cp(
  containerDistDir,
  buildDir,
  {
    force: true,
    recursive: true,
    filter(src) {
      return !src.startsWith(path.join(containerDistDir, "preview"));
    }
  },
);

await Promise.all([
  "src/conf.yaml",
  "netlify.toml",
].map((file) => cp(path.join(__dirname, "..", file), path.join(buildDir, path.basename(file)))));

const brickPackageNames = ["basic", "icons", "illustrations", "form", "shoelace"];

const brickPackages = await Promise.all(brickPackageNames.map(async (pkg) => {
  const pkgDir = path.join(__dirname, "../node_modules/@next-bricks", pkg);

  const bricksJson = JSON.parse(await readFile(path.join(pkgDir, "dist/bricks.json"), "utf8"));

  await cp(
    pkgDir,
    path.join(buildDir, "bricks", pkg),
    {
      force: true,
      recursive: true,
    },
  );

  return bricksJson;
}));

const storyboardsPath = path.join(__dirname, "../src/storyboards.yaml");
const storyboards = yaml.safeLoad(await readFile(storyboardsPath, "utf8"), {
  schema: yaml.JSON_SCHEMA,
  json: true,
});

const bootstrapJson = {
  brickPackages,
  storyboards: storyboards.map((storyboard) => ({
    ...storyboard,
    app: {
      noAuthGuard: true,
      standaloneMode: true,
      ...storyboard.app,
    }
  })),
};
const bootstrapJsonContent = JSON.stringify(bootstrapJson);
const bootstrapJsonHash = getContentHash(bootstrapJsonContent);
const bootstrapJsonPath = `bootstrap.${bootstrapJsonHash}.json`;

await writeFile(path.join(buildDir, bootstrapJsonPath), bootstrapJsonContent);

const indexHtmlPath = path.join(buildDir, "index.html");
const indexHtml = await readFile(indexHtmlPath, "utf8");

const updatedIndexHtml = indexHtml.replaceAll(
  "<!--# echo var='base_href' default='/' -->",
  "/"
).replaceAll(
  "<!--# echo var='core_root' default='' -->",
  ""
).replaceAll(
  "<!--# echo var='mock_date' default='' -->",
  ""
).replaceAll(
  "<!--# echo var='public_cdn' default='' -->",
  ""
).replace(
  "</head>",
  `<script>window.NO_AUTH_GUARD=!0;window.STANDALONE_MICRO_APPS=!0;window.APP_ROOT="";window.BOOTSTRAP_FILE=${JSON.stringify(bootstrapJsonPath)}</script></head>`
);

await writeFile(indexHtmlPath, updatedIndexHtml);

function getContentHash(content) {
  const hash = createHash("sha1");
  hash.update(content);
  return hash.digest("hex").slice(0, 8);
}
