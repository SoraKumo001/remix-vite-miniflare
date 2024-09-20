import { build } from "esbuild";
import { Request, Response } from "miniflare";
import { ViteDevServer } from "vite";
import { createRequire } from "node:module";
import fs from "fs";

const require = createRequire(process.cwd());

const isWindows = process.platform === "win32";

const getNormalPath = (target: string | null) => {
  if (!target) {
    throw new Error("specifier is required");
  }
  let normalPath = target;

  if (normalPath[0] === "/") {
    normalPath = normalPath.substring(1);
  }
  if (normalPath.startsWith("file:")) {
    normalPath = normalPath.substring(5);
  }
  if (isWindows) {
    if (normalPath[0] === "/") {
      normalPath = normalPath.substring(1);
    }
  }
  return normalPath;
};

export const unsafeModuleFallbackService = async (
  vite: ViteDevServer,
  request: Request
) => {
  const method = request.headers.get("X-Resolve-Method");

  const url = new URL(request.url);
  const isWindows = process.platform === "win32";
  const origin = url.searchParams.get("specifier");
  const target = getNormalPath(origin);
  const referrer = getNormalPath(url.searchParams.get("referrer"));
  const rawSpecifier = getNormalPath(url.searchParams.get("rawSpecifier"));
  // console.log("===============\n", { method, target, referrer, rawSpecifier });

  let specifier = target!;
  if (isWindows) {
    if (specifier[0] === "/") {
      specifier = specifier.substring(1);
    }
  }
  if (!specifier) {
    throw new Error("specifier is required");
  }
  if (specifier.startsWith("file:")) {
    specifier = specifier.substring(5);
  }
  if (isWindows) {
    if (specifier[0] === "/") {
      specifier = specifier.substring(1);
    }
  }

  if (rawSpecifier[0] !== "." && rawSpecifier[0] !== "/") {
    if (!fs.existsSync(specifier)) {
      if (method === "import") {
        specifier = import.meta.resolve(rawSpecifier, referrer);
        specifier = specifier.substring(8);
      } else {
        specifier = require.resolve(rawSpecifier, { paths: [referrer] });
        specifier = specifier.replaceAll("\\", "/");
      }

      return new Response(null, {
        status: 301,
        headers: { Location: "/" + specifier },
      });
    }
  }

  const result = await build({
    entryPoints: [specifier],
    format: "esm",
    target: "esnext",
    platform: "browser",
    bundle: ["@remix-run/react"].some((v) => rawSpecifier.includes(v)),
    packages: "external",
    mainFields: ["module", "browser", "main"],
    conditions: ["workerd", "worker", "webworker", "import"],
    minify: false,
    write: false,
    logLevel: "error",
    jsxDev: true,
  });
  const esModule =
    `import  { createRequire } from "node:module";
  const ___r = createRequire("/${specifier}");
  const require = (id) => {
    const result = ___r(id);
    return { ...result, ...result.default };
  };` + result.outputFiles?.[0].text;

  return new Response(
    JSON.stringify({
      name: origin?.substring(1),
      esModule,
    }),
    {
      headers: {
        "Content-Type": "application/javascript",
      },
    }
  );
};
