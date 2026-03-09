# Ahrefs MCP Proxy

> **This is not an issue with Ahrefs.** The Ahrefs MCP server is well-built and works correctly. The problem is that Claude.ai's MCP connector attempts OAuth 2.1 authentication, while the Ahrefs server uses Bearer token auth. Claude is unlikely to change this behavior, and Ahrefs has declined to implement OAuth on their end, pointing to Claude as the responsible party. Neither side is fixing it. This project is a workaround until one of them does.

A Cloudflare Worker that proxies requests to the Ahrefs remote MCP server, injecting your MCP key so Claude.ai (and any other MCP client) can access all 95+ Ahrefs tools.

Works on **all paid Ahrefs plans** (Lite, Standard, Advanced, Enterprise). No Enterprise subscription required.

## Why This Exists

Ahrefs has a remote MCP server at `api.ahrefs.com/mcp/mcp` — 95+ tools covering Site Explorer, Keywords Explorer, Brand Radar, Site Audit, Rank Tracker, batch analysis, and more.

Claude.ai has a native Ahrefs MCP connector that uses OAuth to authenticate. That OAuth flow fails:

> *"There was an error connecting to the MCP server. Please check your server URL and make sure your server handles auth correctly."*

**The root cause:** The [MCP spec](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/authorization/) defines OAuth 2.1 as the standard auth mechanism for remote MCP servers. Claude.ai follows this and attempts an OAuth handshake when connecting. The Ahrefs MCP server uses simple Bearer token auth (their "MCP Key") — no OAuth discovery endpoint, no authorization URL, no token exchange. The handshake fails because the two sides speak different auth protocols.

Ahrefs could fix this by adding OAuth 2.1 support to their MCP endpoint. Claude could fix this by supporting a simple "pass this Bearer token" mode for servers that don't implement OAuth. Neither is doing so. This is the same issue [Suganthan Mohanadasan documented](https://suganthan.com/blog/ahrefs-mcp-server-manus-skill/) with Manus.

**How the proxy fixes it:** Claude.ai connects to your Worker as an open MCP server — no auth required on Claude's side, so no OAuth handshake happens. The Worker then adds your Ahrefs MCP key as a Bearer token and forwards everything to Ahrefs. Claude never talks to Ahrefs directly, so the OAuth problem never occurs.

```
Claude.ai ──(no auth)──▶ Cloudflare Worker ──(Bearer token)──▶ Ahrefs MCP Server
```

## MCP Key vs API v3 Key

Ahrefs has two completely different key types. Using the wrong one is the most common setup mistake.

| | MCP Key | API v3 Key |
|---|---|---|
| **Where to get it** | [app.ahrefs.com/user/api-access](https://app.ahrefs.com/user/api-access) → "MCP Key" section | Same page → "API Key" section |
| **Works with** | Remote MCP server (`api.ahrefs.com/mcp/mcp`) | Deprecated local npm server, direct API v3 |
| **Plan required** | Any paid plan (Lite+) | Enterprise only |
| **Used here** | Yes | No |

The deprecated local MCP server (the `@ahrefs/mcp` npm package on [GitHub](https://github.com/ahrefs/ahrefs-mcp-server)) is a separate system. It uses API v3 keys, requires Enterprise, and Ahrefs have marked it as outdated. Don't use it.

## Setup

### 1. Get Your Ahrefs MCP Key

Go to [app.ahrefs.com/user/api-access](https://app.ahrefs.com/user/api-access). Find the **MCP Key** section (not the API Key section). Generate one if you don't have it.

### 2. Deploy the Cloudflare Worker

```bash
git clone https://github.com/matthewgkay/ahrefs-mcp-proxy.git
cd ahrefs-mcp-proxy
npm install
npx wrangler secret put AHREFS_MCP_KEY
# Paste your MCP key when prompted
npx wrangler deploy
```

Your proxy will be live at `https://ahrefs-mcp.<your-subdomain>.workers.dev/mcp`.

### 3. Connect to Claude.ai

In Claude.ai, go to **Settings → Integrations** and add your Worker URL as a remote MCP server:

```
https://ahrefs-mcp.<your-subdomain>.workers.dev/mcp
```

That's it. Ask Claude for Ahrefs data and it'll route through your Worker.

## What You Get

The Ahrefs remote MCP server exposes 95+ tools:

| Category | ~Tools | What It Covers |
|---|---|---|
| Site Explorer | 24 | Backlinks, referring domains, organic keywords, top pages, DR history, competitors |
| Web Analytics | 34 | Visitors by country, device, browser, source, UTM, referrer, time series |
| Keywords Explorer | 6 | Search volume, difficulty, CPC, matching terms, related terms |
| Brand Radar | 9 | AI brand mentions, share of voice across LLMs, cited domains and pages |
| Site Audit | 3 | Crawl health, issues, page-level details |
| Rank Tracker | 5 | SERP snapshots, competitor rankings, position tracking |
| Batch Analysis | 1 | Compare up to 100 domains in a single call |
| SERP Overview | 1 | Live SERP data for any keyword |

## Usage Tips

Once connected, just ask Claude naturally:

- *"Compare the backlink profiles of these three competitors."*
- *"What keywords drive the most traffic to example.com?"*
- *"Check Brand Radar — are we showing up in AI answers?"*
- *"Pull the SERP for 'best project management tools' and show DR for each result."*
- *"Run a batch analysis on these 20 domains."*

A few things to know about the Ahrefs MCP API:

- **Call the `doc` tool first** before using any tool for the first time. The `tools/list` response returns simplified schemas missing required fields and valid column names. `doc` gives you the real schema.
- **Most tools need a `date` parameter** in `YYYY-MM-DD` format, even when the schema doesn't flag it as required. Use the first of the current month for recent data.
- **Monetary values are in cents.** A `cpc` of 450 means $4.50.
- **Use `mode: subdomains`** when analyzing a full domain. The `domain` mode excludes www and subdomains, which gives incomplete data for most sites.
- **The `select` parameter format varies.** Most tools take a comma-separated string (`"keyword,volume,traffic"`). `batch-analysis` takes an array (`["domain_rating", "org_traffic"]`). The `doc` tool tells you which.

## How It Works

The Cloudflare Worker is a thin HTTP proxy (~50 lines of TypeScript):

1. Receives MCP requests at `/mcp` (any method)
2. Attaches your Ahrefs MCP key as a `Bearer` token in the `Authorization` header
3. Forwards the request to `https://api.ahrefs.com/mcp/mcp`, including `Content-Type`, `Accept`, and `Mcp-Session-Id` headers
4. Streams the response back to the client

No data transformation, no caching, no state, no MCP SDK needed. It's a pass-through that solves the auth mismatch.

## Project Structure

```
ahrefs-mcp-proxy/
├── src/
│   └── index.ts          ← Cloudflare Worker (~50 lines)
├── wrangler.toml         ← Worker configuration
├── package.json
├── package-lock.json
├── tsconfig.json
├── LICENSE
└── README.md
```

## Troubleshooting

**401 Unauthorized from Ahrefs**: You're using an API v3 key instead of an MCP key, or the Wrangler secret wasn't set. Run `npx wrangler secret put AHREFS_MCP_KEY` again.

**Claude can't connect to the Worker**: Make sure the Worker deployed successfully (`npx wrangler deploy`) and the URL you added in Claude.ai ends in `/mcp`.

**"column not found" errors from Ahrefs**: Call the `doc` tool first to get valid column names before using a tool's `select` parameter. Tell Claude: *"First call the doc tool for site-explorer-organic-keywords, then pull the data."*

**Missing data / incomplete results**: Use `mode: subdomains` for domain-level analysis. The `domain` mode excludes subdomains.

## Background

Inspired by [Suganthan Mohanadasan's post](https://suganthan.com/blog/ahrefs-mcp-server-manus-skill/) on solving the same OAuth/Bearer token mismatch with the Ahrefs MCP server in Manus. His approach was a Python skill for Manus. This takes the same idea and implements it as a Cloudflare Worker for Claude.ai and any other MCP client.

## License

MIT
