import { realpathSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
const clientRoot = realpathSync(
  resolve(repositoryRoot, "apps/web/dist/client"),
);
const indexPath = realpathSync(resolve(clientRoot, "index.html"));
const port = Number(process.env.COUNTERLAB_E2E_PORT ?? "5173");

if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("COUNTERLAB_E2E_PORT must be an unprivileged TCP port");
}

function isContained(candidate) {
  const pathFromRoot = relative(clientRoot, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
}

const mediaTypes = new Map([
  [".counterlab", "application/vnd.counterlab.proof+zip"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

async function publicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  const candidate = resolve(clientRoot, `.${decoded}`);
  if (!isContained(candidate)) return { status: 400 };
  try {
    const candidateStat = await stat(candidate);
    if (!candidateStat.isFile()) return { status: 404 };
    const physical = await realpath(candidate);
    if (!isContained(physical)) return { status: 400 };
    return { status: 200, path: physical };
  } catch {
    return { status: 404 };
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/api/health") {
    const body = Buffer.from(
      JSON.stringify({
        ok: true,
        data: {
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: "server-key-required",
          liveCodex: "local-runner-required",
          liveKernel: "local-runner-required",
          readiness: requestUrl.searchParams.has("readiness")
            ? "not-ready"
            : "not-checked",
          sandbox: "local-runner-required",
          generationFilesystemReadIsolation: "PARTIAL",
          requestId: "static-design-review-health",
        },
      }),
    );
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(method === "HEAD" ? undefined : body);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/")) {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(method === "HEAD" ? undefined : '{"error":"not mocked"}');
    return;
  }

  const requested = await publicFile(requestUrl.pathname);
  const filePath = requested.status === 200 ? requested.path : indexPath;
  if (requested.status === 400 || filePath === undefined) {
    response.writeHead(requested.status);
    response.end();
    return;
  }

  const body = await readFile(filePath);
  const isAsset = relative(clientRoot, filePath).startsWith(`assets${sep}`);
  response.writeHead(200, {
    "Cache-Control": isAsset
      ? "public, max-age=31536000, immutable"
      : "no-store",
    "Content-Length": String(body.byteLength),
    "Content-Type":
      mediaTypes.get(extname(filePath)) ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(method === "HEAD" ? undefined : body);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `CounterLab built client available at http://127.0.0.1:${port}\n`,
  );
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
