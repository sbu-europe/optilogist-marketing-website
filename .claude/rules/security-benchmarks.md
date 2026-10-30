# Security benchmarks (mandatory)

Product confidentiality, business-logic protection, architecture security and data privacy are non-negotiable. Apply these benchmarks before writing or changing anything in this repo, and again before reporting the work as done.

**The principle behind them:** everything sent to a browser can be read, however it is minified or obfuscated. Protection therefore comes from not shipping something, never from hiding it. Obfuscation only slows a reader down and never makes shipped code count as protected.

## Workflow

1. **Before the change:** classify what will be shipped (table below) and name the benchmarks it touches.
2. **While changing:** if a change would fail a benchmark, stop and tell the user the risk and a safer option. Do not ship it and flag it afterwards.
3. **After the change:** run the scans below on the changed files and report the result, including anything that failed or could not be checked.
4. **Unrelated problems:** report them, but do not fix them without being asked.
5. **Findings:** report them in chat, not in this repo. Vulnerability details must never land in a file that could be deployed.

## Data classification

| Class | Examples | May it reach a browser? |
|---|---|---|
| Public | Marketing copy, delivered features described at a business level | Yes |
| Demo-only | Invented sample data, simulated behaviour written for the demo | Yes, inside `demo/` only |
| Internal | Real module, model and endpoint names, internal product name, workflow rules, status machines, schema, infrastructure | No, unless the user accepts it for a named case |
| Secret | Credentials, tokens, keys, connection strings, real personal or customer data | Never, and never in git |

## Benchmarks

Severity: **Blocker** means do not ship. **High** means ship only if the user accepts the risk. **Medium** means report it.

### A. Secrets and data
- **A1 Blocker:** no credentials, tokens, keys or connection strings in any tracked file or in git history.
- **A2 Blocker:** no real personal or customer data: names, phones, emails, addresses, IPs, plates, GPS traces, prices. Sample data must be invented, using reserved values such as `example.com` and `203.0.113.x`.
- **A3 Blocker:** captured pages must contain no live session values, CSRF tokens or user identifiers from QA.
- **A4 High:** nothing sensitive in `localStorage`, `sessionStorage`, URLs or console output.

### B. Architecture exposure
- **B1 Blocker:** no QA, staging or internal hostnames, internal IPs or infrastructure details.
- **B2 High:** no real API routes, admin URLs, app or model names, or database identifiers in shipped code. Demo equivalents must be neutral.
- **B3 High:** no framework or server fingerprints (admin templates, version strings, default error pages) beyond what the demo strictly needs.
- **B4 High:** no source maps, developer comments, TODOs, debug flags or dead code in shipped files.
- **B5 Blocker:** the internal product name must not be visible to users or present in shipped identifiers on new work.

### C. Business logic and reverse engineering
- **C1 Blocker:** no proprietary algorithms in client code: scoring, bidding, pricing, allocation, routing or optimisation rules.
- **C2 High:** the demo simulates outcomes with canned data. It must not reimplement real rules, thresholds, validations or status machines.
- **C3 High:** copying production front-end code into `demo/` is an exposure decision. Prefer a purpose-written or reduced version, and flag any copy.
- **C4 High:** public copy describes what the product does for the customer, not how it is built or which rules drive it. Describe delivered behaviour only.
- **C5 Medium:** ask of each change, "what could a competitor learn from View Source?" If the answer goes beyond the marketing message, treat it as a finding.

### D. API and access control (applies wherever backend or API code appears)
- **D1 Blocker:** every endpoint enforces authentication and object-level authorization on the server. Hiding a menu item is not access control.
- **D2 Blocker:** the server validates all input and returns only the fields the caller needs.
- **D3 High:** rate limiting, safe error messages with no stack traces, and audit logging on sensitive actions.
- **D4 High:** tokens live in `HttpOnly`, `Secure`, `SameSite` cookies rather than `localStorage`.
- **D5 Blocker:** the static demo never calls a real backend, and QA remains read-only.

### E. Client and delivery
- **E1 High:** demo forms never post and no data leaves the browser, except for declared third-party services.
- **E2 High:** third-party calls and scripts are justified, send no business data, pin exact versions and use SRI. Prefer self-hosting.
- **E3 High:** escape anything rendered from data, with no untrusted `innerHTML`, `eval` or inline handlers on new work.
- **E4 High:** deployment sets CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors`.
- **E5 Blocker:** only intended files are deployed. `.git`, `.claude`, `.vscode` and developer tooling must never be served.
- **E6 Medium:** the demo is `noindex`, and no exposure depends on a page being unlinked.

## Scans

Run from the repo root on changed files, or on the whole repo before a release. A hit needs a decision, not an automatic failure, because the `demo/` baseline has known hits.

```sh
# A1, A3 secrets
git grep -inE 'api[_-]?key|secret[_-]?key|private[_-]?key|sessionid|BEGIN [A-Z ]*PRIVATE|(password|token)["'"'"' ]*[:=] *["'"'"'][^"'"'"']{6,}'
git grep -hE 'csrfmiddlewaretoken" value="' | grep -v 'value="demo"'
# A2 personal data
git grep -hoiE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' | grep -v 'example\.com' | sort -u
# B1 hosts and IPs
git grep -inE 'qa\.optilogist|staging|localhost|\b(10|192\.168)\.[0-9]+\.[0-9]+'
# B2, B5, C4 internals on public pages
git grep -inE 'dfms|bs23|brain-?station|proof.?of.?delivery|/api/|/admin/|django|postgres|redis|celery' -- . ':!demo'
# B4 source maps
git grep -l 'sourceMappingURL'; git ls-files | grep -E '\.map$|\.env|\.pem|\.key$|\.sql$|\.sqlite|\.har$'
# E2 outbound hosts
git grep -hoE 'https?://[A-Za-z0-9.-]+' | sort | uniq -c | sort -rn
```

Passing these scans does not prove the work is secure. Also read the change for what it reveals.

## Reporting format

For each finding, give the severity and benchmark ID, the file and line, what an outsider could learn or do, and the recommended fix. Report only what was verified, and say what was not checked.
