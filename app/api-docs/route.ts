import { ApiReference } from "@scalar/nextjs-api-reference";

export const runtime = "nodejs";

export const GET = ApiReference({
  theme: "kepler",
  pageTitle: "Aethra API Docs",
  title: "Aethra API Docs",
  spec: {
    url: "/openapi.json",
  },
  defaultHttpClient: {
    targetKey: "shell",
    clientKey: "curl",
  },
});
