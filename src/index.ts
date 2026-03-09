const UPSTREAM = "https://api.ahrefs.com/mcp/mcp";

type Env = {
  AHREFS_MCP_KEY: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({ name: "ahrefs-mcp", version: "1.0.0" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    // Build headers for upstream, injecting auth
    const upstreamHeaders = new Headers();
    upstreamHeaders.set("Authorization", `Bearer ${env.AHREFS_MCP_KEY}`);

    // Forward relevant headers from the client
    const forwardHeaders = ["content-type", "accept", "mcp-session-id"];
    for (const h of forwardHeaders) {
      const val = request.headers.get(h);
      if (val) upstreamHeaders.set(h, val);
    }

    // Forward the request to Ahrefs
    const upstreamResponse = await fetch(UPSTREAM, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.body,
    });

    // Build response headers, forwarding relevant ones back
    const responseHeaders = new Headers();
    const passBackHeaders = [
      "content-type",
      "mcp-session-id",
      "cache-control",
    ];
    for (const h of passBackHeaders) {
      const val = upstreamResponse.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
} satisfies ExportedHandler<Env>;
