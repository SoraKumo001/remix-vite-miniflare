import {
  FetchResult,
  ModuleRunner,
  ssrModuleExportsKey,
} from "vite/module-runner";

export type RunnerEnv = {
  __viteUnsafeEval: {
    eval: (
      code: string,
      filename?: string
    ) => (...args: unknown[]) => Promise<void>;
  };
  __viteFetchModule: {
    fetch: (request: Request) => Promise<Response>;
  };
};

class WorkerdModuleRunner extends ModuleRunner {
  constructor(env: RunnerEnv) {
    super(
      {
        root: "/",
        sourcemapInterceptor: "prepareStackTrace",
        transport: {
          fetchModule: async (...args) => {
            const response = await env.__viteFetchModule.fetch(
              new Request("https://localhost", {
                method: "POST",
                body: JSON.stringify(args),
              })
            );
            return response.json<FetchResult>();
          },
        },
        hmr: false,
      },
      {
        runInlinedModule: async (context, transformed, id) => {
          const keys = Object.keys(context);
          const fn = env.__viteUnsafeEval.eval(
            `'use strict';async(${keys.join(",")})=>{${transformed}}`,
            id
          );
          await fn(...keys.map((key) => context[key as keyof typeof context]));
          Object.freeze(context[ssrModuleExportsKey]);
        },
        async runExternalModule(filepath) {
          return import(filepath);
        },
      }
    );
  }
}

export default {
  async fetch(request: Request, env: RunnerEnv) {
    const runner = new WorkerdModuleRunner(env);
    const entry = request.headers.get("x-vite-entry")!;
    const mod = await runner.import(entry);
    const handler = mod.default as ExportedHandler;
    if (!handler.fetch) throw new Error(`Module does not have a fetch handler`);
    try {
      const result = handler.fetch(request, env, {
        waitUntil: () => {},
        passThroughOnException() {},
      });
      return result;
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  },
};
