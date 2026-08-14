export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    // The full dashboard is protected by Cloudflare Zero Trust Access.
    if (url.pathname === "/") {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (url.pathname === "/apps" || url.pathname === "/apps/") {
      url.pathname = "/apps/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (url.pathname === "/inventory" || url.pathname === "/inventory/") {
      url.pathname = "/inventory/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (url.pathname === "/giveaway" || url.pathname === "/giveaway/") {
      url.pathname = "/giveaway/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (
      url.pathname.startsWith("/inventory/") ||
      url.pathname.startsWith("/giveaway/") ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/avatars/")
    ) {
      return env.ASSETS.fetch(request);
    }

    return Response.redirect(new URL("/", request.url), 302);
  },
} satisfies ExportedHandler<Env>;
