import { build } from "esbuild";
import { ViteDevServer } from "vite";
import { Miniflare, mergeWorkerOptions, MiniflareOptions } from "miniflare";
import path from "path";
import { unstable_getMiniflareWorkerOptions } from "wrangler";
import fs from "fs";

async function getTransformedCode(modulePath: string) {
  const result = await build({
    entryPoints: [modulePath],
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

export const createMiniflare = async (viteDevServer: ViteDevServer) => {
  const modulePath = path.resolve(__dirname, "miniflare_module.ts");
  const code = await getTransformedCode(modulePath);
  const config = fs.existsSync("wrangler.toml")
    ? unstable_getMiniflareWorkerOptions("wrangler.toml")
    : { workerOptions: {} };
  const miniflareOption: MiniflareOptions = {
    compatibilityDate: "2024-08-21",
    modulesRoot: "/",
    modules: [
      {
        path: modulePath,
        type: "ESModule",
        contents: code,
      },
    ],
    unsafeEvalBinding: "__viteUnsafeEval",
    serviceBindings: {
      __viteFetchModule: async (request) => {
        const args = (await request.json()) as Parameters<
          typeof viteDevServer.environments.ssr.fetchModule
        >;
        const result = await viteDevServer.environments.ssr.fetchModule(
          ...args
        );
        return new Response(JSON.stringify(result));
      },
    },
  };
  if (
    "compatibilityDate" in config.workerOptions &&
    !config.workerOptions.compatibilityDate
  ) {
    delete config.workerOptions.compatibilityDate;
  }
  const options = mergeWorkerOptions(
    miniflareOption,
    config.workerOptions as WorkerOptions
  ) as MiniflareOptions;

  const miniflare = new Miniflare({
    ...options,
  });
  return miniflare;
};
