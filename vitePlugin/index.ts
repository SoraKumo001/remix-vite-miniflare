import { once } from "node:events";
import { Readable } from "node:stream";
import path from "path";
import { Connect, Plugin as VitePlugin } from "vite";
import type { ServerResponse } from "node:http";
import { createMiniflare } from "./miniflare";
import {
  Response as MiniflareResponse,
  Request as MiniflareRequest,
  RequestInit,
} from "miniflare";

export function devServer(): VitePlugin {
  const plugin: VitePlugin = {
    name: "edge-dev-server",
    configureServer: async (viteDevServer) => {
      const runner = createMiniflare(viteDevServer);
      return () => {
        if (!viteDevServer.config.server.middlewareMode) {
          viteDevServer.middlewares.use(async (req, nodeRes, next) => {
            try {
              const request = toRequest(req);
              request.headers.set(
                "x-vite-entry",
                path.resolve(__dirname, "server.ts")
              );
              const response = await (await runner).dispatchFetch(request);
              await toResponse(response, nodeRes);
            } catch (error) {
              next(error);
            }
          });
        }
      };
    },
    apply: "serve",
    config: () => {
      return {
        ssr: {
          noExternal: true,
          target: "webworker",
          optimizeDeps: {
            include: [
              "react",
              "react/jsx-dev-runtime",
              "react-dom",
              "react-dom/server",
              "@remix-run/server-runtime",
              "@remix-run/cloudflare",
            ],
          },
        },
      };
    },
  };
  return plugin;
}

export function toRequest(nodeReq: Connect.IncomingMessage): MiniflareRequest {
  const origin =
    nodeReq.headers.origin && "null" !== nodeReq.headers.origin
      ? nodeReq.headers.origin
      : `http://${nodeReq.headers.host}`;
  const url = new URL(nodeReq.originalUrl!, origin);

  const headers = Object.entries(nodeReq.headers).reduce(
    (headers, [key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else if (typeof value === "string") {
        headers.append(key, value);
      }
      return headers;
    },
    new Headers()
  );

  const init: RequestInit = {
    method: nodeReq.method,
    headers,
  };

  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    init.body = nodeReq;
    (init as { duplex: "half" }).duplex = "half";
  }

  return new MiniflareRequest(url, init);
}

export async function toResponse(
  res: MiniflareResponse,
  nodeRes: ServerResponse
) {
  nodeRes.statusCode = res.status;
  nodeRes.statusMessage = res.statusText;
  nodeRes.writeHead(res.status, Object.entries(res.headers.entries()));
  if (res.body) {
    const readable = Readable.from(
      res.body as unknown as AsyncIterable<Uint8Array>
    );
    readable.pipe(nodeRes);
    await once(readable, "end");
  } else {
    nodeRes.end();
  }
}
