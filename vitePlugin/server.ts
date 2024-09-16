import { createRequestHandler } from "@remix-run/cloudflare";
// eslint-disable-next-line import/no-unresolved
import * as build from "virtual:remix/server-build";
import type { AppLoadContext } from "@remix-run/cloudflare";

const fetch = async (req: Request, context: AppLoadContext) => {
  const handler = createRequestHandler(build);
  return handler(req, context);
};

export default { fetch };
