import type { MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    {
      name: "description",
      content: "Welcome to Remix on Cloudflare!",
    },
  ];
};

export default function Index() {
  const value = useLoaderData<Record<string, unknown>>();
  return (
    <div className="font-sans p-4">
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function loader() {
  return {
    userAgent: navigator.userAgent,
  };
}
