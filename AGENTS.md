# Project Agent Guide

This document is the unified working guide for AI coding agents in `OctopusMCPServer`.

It applies to:

- Codex
- Claude Code
- Gemini
- Any other AI agent that reads code, changes code, writes documentation, or resolves conflicts in this repository

This file is intended to be the foundation for future development of this project. An agent should be able to use it to quickly establish a consistent understanding of:

- what this project is
- what the current runtime architecture is
- what the project actually values
- which constraints must not be broken
- which files should be read first before different kinds of changes
- which direction should be preferred during merge conflict resolution

If this document conflicts with the current code, the current code wins. If this document becomes outdated, update it as part of the same change.

---

## 1. Project Identity

`OctopusMCPServer` is a TypeScript-based MCP server. It exposes Octoparse-related capabilities over HTTP for MCP clients.

This repository is not just a flat list of tools and not just a thin API wrapper. The current codebase includes several important responsibilities that must be treated as first-class architecture:

- an Express 5 HTTP server
- MCP over Streamable HTTP
- session creation, recovery, and deletion
- dual authentication entry points through JWT and API key
- request-scoped context built on `AsyncLocalStorage`
- downstream Octoparse API access and HTTP connection pooling
- tool middleware chains
- structured logging and secure error handling
- optional Redis-backed persistence
- LLM-oriented tool interface design

The core value of this repository is not only "making the API work." Its real value is:

- correctly implementing MCP protocol behavior
- correctly isolating authentication context across users and requests
- correctly recovering distributed sessions
- correctly converging complex business capabilities into tool interfaces that LLMs can understand, choose, and recover from

---

## 2. Project Goals

### 2.1 Core Goals

1. Provide stable and callable Octoparse capabilities to MCP clients.
2. Support both JWT and API key authentication modes.
3. Support cross-instance session recovery without persisting raw credentials.
4. Make tools easy for LLMs to understand, choose, and recover from when errors happen.
5. Improve runtime efficiency without breaking user isolation.

### 2.2 What This Project Optimizes For

When making tradeoffs, the rough priority order is:

1. Correctness
2. User isolation and security
3. LLM interpretability
4. Interface convergence and stability
5. Performance optimization

If a performance optimization conflicts with authentication isolation or request isolation, keep isolation and correctness.

### 2.3 Non-Goals

Do not assume the following are already complete or production-perfect:

- a comprehensive automated test system
- strict enforcement of every declared security switch
- a mature and fully developed resource system
- an infinitely expandable tool set
- long tool descriptions as the primary way to guide model choice

---

## 3. Source Of Truth

For an agent working in this repository, the source of truth is ordered as follows.

### 3.1 First Priority

The current source code.

The most important files include:

- `src/index.ts`
- `src/handlers.ts`
- `src/server.ts`
- `src/tools.ts`
- `src/transport.ts`
- `src/api/octoparse.ts`
- `src/api/clients/http-client-factory.ts`
- `src/api/auth.ts`
- `src/auth/token-provider.ts`
- `src/tools/tool-definitions.ts`
- `src/tools/tool-registry.ts`
- `src/tools/middleware.ts`
- `src/utils/request-context.ts`
- `src/services/session-service.ts`
- `src/services/export-state-service.ts`
- `src/middleware/request-logger.ts`
- `src/middleware/error-handler.ts`
- `src/security/*.ts`
- `src/config/app-config.ts`

### 3.2 Second Priority

This file.

### 3.3 Important Rule

Do not invent architecture from stale descriptions, old mental models, or generic best practices. Before entering a high-risk area, go back to the current code and confirm the actual implementation.

---

## 4. Current Runtime Architecture

### 4.1 Main Request Flow

The current mainline request flow is roughly:

1. `src/index.ts`
   - loads environment variables
   - resets and reads `AppConfig`
   - initializes Express
   - registers middleware and MCP routes

2. `src/handlers.ts`
   - handles MCP `POST`, `GET`, and `DELETE`
   - extracts `Authorization`, `x-api-key`, and `mcp-session-id`
   - decides the authentication mode
   - performs local transport reuse or Redis-backed session recovery
   - processes requests inside `RequestContextManager.runWithContext(...)`

3. `src/server.ts`
   - creates the `McpServer`
   - registers tools and resources

4. `src/tools.ts`
   - registers tools using a `getApi()` factory
   - does not bind a long-lived API instance at registration time

5. `src/tools/tool-registry.ts`
   - wraps the tool execution pipeline
   - runs rate limiting, authorization, schema validation, handler execution, and response wrapping in order

6. `src/api/octoparse.ts`
   - implements the main downstream business API wrapper

7. `src/api/clients/http-client-factory.ts`
   - manages Axios clients, HTTP connections, interceptors, and pooling

### 4.2 Architectural Layers

The current architecture can be understood as five layers:

- HTTP / MCP entry layer
  - `index.ts`
  - `handlers.ts`
  - `server.ts`
  - `transport.ts`

- request context and session layer
  - `request-context.ts`
  - `session-service.ts`
  - `export-state-service.ts`

- tool layer
  - `tool-definitions.ts`
  - `tool-registry.ts`
  - `tools/middleware.ts`

- downstream integration layer
  - `api/octoparse.ts`
  - `api/auth.ts`
  - `auth/token-provider.ts`
  - `api/clients/http-client-factory.ts`

- security and infrastructure layer
  - `security/*.ts`
  - `request-logger.ts`
  - `error-handler.ts`
  - `logger.ts`
  - `redis.ts`
  - `app-config.ts`

### 4.3 Important Current Facts

The current code already establishes these mainline facts:

- request-scoped context uses `AsyncLocalStorage`
- tool execution depends on lazy `getApi()` creation
- Redis session metadata does not store raw JWTs or raw API keys
- API key mode uses `computeApiKeyId()` to create a stable identifier for logging and tracing
- the resource layer is intentionally lightweight
- asynchronous export state is stored through `ExportStateService`

---

## 5. Tool Strategy: A Major Direction Of The Project

This is one of the most important forward-looking directions for the repository.

### 5.1 Strategic Direction

The project is intentionally moving toward a smaller and more focused tool surface:

- the target external tool count should converge to roughly `3-4` tools
- tool descriptions should become shorter, clearer, and more focused
- tools should expose higher-level capabilities and hide business details internally

The future direction is not "keep adding more tools." The intended direction is:

- fewer tools
- clearer boundaries
- higher-level abstractions
- less business leakage
- less choice burden for the model

### 5.2 Why This Matters

Tool simplification is not cosmetic. It directly affects model performance:

- too many tools create selection difficulty for LLMs
- overly fragmented responsibilities increase tool misselection
- overly long descriptions dilute the real intent
- exposing too many business details makes the model confuse implementation details with usage contracts

Therefore, tool design in this repository should prioritize:

1. making it easier for the model to choose the right tool
2. making each tool's responsibility easier to understand
3. keeping descriptions focused on when to use it, what to pass in, and what comes back
4. pushing business complexity into the implementation instead of exposing it on the external interface

### 5.3 External Tool Surface Policy

All future tool-related changes should converge toward the following:

- merge duplicated or overlapping tools when possible
- encapsulate multi-step business workflows behind a small number of higher-level tools
- shorten descriptions while preserving the most important usage boundaries
- hide internal business details, platform details, and implementation details

The following directions are discouraged:

- exposing one separate tool for every small operation
- compensating for unclear boundaries with very long descriptions
- exposing internal DTOs, internal processes, or internal state machines as public tool contracts

### 5.4 Current Reality And Forward Rule

`src/tools/tool-definitions.ts` still contains many tools today. That is the current reality.

However, every future change should follow this rule:

- do not add new tools unless there is a strong reason
- if an issue can be solved by extending an existing higher-level tool, prefer extension over further splitting
- if a change involves tool refactoring, the default direction should be convergence into fewer tools

---

## 6. Tool Description Policy

### 6.1 Desired Style

Future tool descriptions should be:

- short
- clear
- intent-oriented
- choice-oriented
- optimized for successful calls

Descriptions should focus on:

- what problem the tool solves
- when it should be used
- the most important inputs
- the critical constraints that must be followed

Descriptions should minimize:

- long business background sections
- excessive repeated examples
- over-expanded internal rules
- large enumerations of distracting details

### 6.2 Tool Descriptions Are Part Of The Product

Tool descriptions are not ordinary comments. They are part of the model-facing product contract.

If a change affects any of the following:

- tool name
- input schema
- output shape
- functional boundary
- tool convergence or tool splitting

then the description must be reviewed at the same time.

### 6.3 Do Not Use Verbosity To Compensate For Bad Boundaries

If a tool needs a very long description just to avoid misuse, first consider:

- whether the boundary itself should be redesigned
- whether the tool should be merged with another one
- whether the abstraction level should be raised

Do not default to making the description longer.

---

## 7. Merge Conflict Policy

The repository will continue to see tool-count and tool-description optimization. Merge conflicts in this area must therefore be resolved using explicit rules.

### 7.1 Conflict Resolution Priority

When a merge conflict involves tool design, the default priority is:

1. keep the option with fewer tools
2. keep the option with the higher-level abstraction
3. keep the option with shorter and clearer descriptions
4. keep the option that hides more business details from the external surface
5. keep the option that is easier for the model to choose correctly

### 7.2 Default Merge Guidance For Tool Conflicts

Use these defaults:

- if one side adds many fine-grained tools and the other side merges the same capability into a higher-level tool, prefer the higher-level merged version
- if one side keeps very long descriptions and the other side compresses them into short clear descriptions, prefer the shorter descriptions
- if one side exposes internal business rules in the tool surface and the other side encapsulates the complexity internally, prefer internal encapsulation
- if one side expands the number of tools and the other side converges them into a few stable entry points, prefer convergence

### 7.3 When Not To Auto-Pick

Do not make a blind automatic choice in the following situations:

- tool convergence would directly break an existing external compatibility contract
- both sides changed the schema but moved in different abstraction directions
- one side converged tools while the other side fixed a critical security issue
- description simplification would remove a constraint that is mandatory for safe usage

In those cases, the recommended strategy is:

- preserve the security fix first
- continue tool convergence on top of the security-safe version
- do not use "compatibility" as an unlimited excuse for keeping old fragmented tools forever

### 7.4 Preferred Shape Of The Final Merge

The ideal merge result should produce:

- a smaller external tool surface
- more stable external naming
- shorter external descriptions
- stronger internal implementations
- easier model comprehension

---

## 8. Authentication And Session Model

This is one of the highest-risk areas in the repository.

### 8.1 Authentication Modes

The current code supports two authentication entry modes:

- JWT / Bearer
  - read from the `Authorization` header
  - decoded locally only for request context and tool/session metadata
  - actual token validation is delegated downstream

- API key
  - read from `x-api-key`
  - recognized at the entry layer and passed downstream

### 8.2 Authentication Priority

In the current implementation, `x-api-key` takes priority over JWT.

### 8.3 Request Context

The request context currently carries:

- `token`
- `apiKey`
- `apiKeyId`
- `userId`
- `username`
- `sessionId`
- `requestId`
- `correlationId`
- request metadata

This is request-lifetime state, not long-lived shared state.

### 8.4 Redis Session Metadata

Redis session metadata should only contain:

- `userId`
- `userInfo`
- `createdAt`
- `lastSeen`

Hard rules:

- do not persist raw JWTs
- do not persist raw API keys

### 8.5 Session Recovery

The recovery model is:

- reuse the local transport if it already exists
- if the transport does not exist locally, recover metadata from Redis
- require the current request to provide valid authentication again during recovery

In other words:

- Redis stores the recovery anchor
- the current request supplies the authentication truth

### 8.6 Hard Rule

Do not reintroduce the old pattern where a long-lived API instance is bound during session initialization.

The project must continue to preserve this model:

- tool registration is one-time
- API instances are created lazily per request

---

## 9. HTTP Client And Pooling Model

`src/api/clients/http-client-factory.ts` is another high-risk area.

### 9.1 Current Intent

The current design tries to achieve all of the following at the same time:

- reuse connections where possible
- avoid cross-user credential contamination
- avoid repeated interceptor installation

### 9.2 Current Key Design

The current mainline code should be understood through these points:

- Axios instances are cached
- authentication headers are not permanently bound to the client
- request-time authentication is passed through `config.authManager`
- interceptors read `authManager` at request time and inject headers then

### 9.3 Hard Rule

Do not casually change any of the following without a full security analysis:

- cache key strategy
- client reuse granularity
- interceptor installation timing
- the `authManager` propagation model

These changes can easily introduce:

- cross-user credential reuse
- duplicated interceptors
- shared-state contamination
- subtle concurrency bugs

---

## 10. Logging And Sensitive Data Rules

### 10.1 Logging Principle

Prefer the project `Logger`. Do not spread new `console.*` usage.

### 10.2 Never Log These

Never log:

- raw JWTs
- raw API keys
- raw `Authorization` headers
- raw sensitive response bodies
- any directly replayable secret

### 10.3 Safe Alternatives

These are generally acceptable to log:

- `userId`
- `apiKeyId`
- `requestId`
- `correlationId`
- `sessionId`
- redacted account or user information

### 10.4 Request Logger Caveat

When modifying `src/middleware/request-logger.ts`, explicitly check:

- whether the full response body is being logged
- whether unverified JWT parsing results are being treated as trusted identity
- whether sensitive business fields are accidentally being added to structured logs

---

## 11. Configuration Rules

### 11.1 Important Fact

The existence of a field in `AppConfig` does not guarantee that the runtime path actually uses it.

### 11.2 Hard Rule

If you add or change a configuration item:

1. update `src/config/app-config.ts`
2. verify that `src/index.ts`, `src/handlers.ts`, and the relevant runtime path truly consume it
3. do not describe a declared config field as a shipped capability unless it is actually wired into the runtime path

### 11.3 Important Environment Categories

- API
  - `CLIENTAPI_BASE_URL`
  - `OFFICIAL_SITE_URL`

- authentication and security
  - `OIDC_ISSUER`
  - `ALLOWED_ORIGINS`
  - `TRUST_PROXY`

- logging
  - `LOG_LEVEL`
  - `LOG_STRUCTURED`
  - `LOG_ENABLE_CONSOLE`
  - `LOG_ENABLE_FILE`

- Redis
  - `REDIS_ENABLED`
  - `REDIS_HOST`
  - `REDIS_PORT`
  - `REDIS_SESSION_TTL`

- HTTP
  - `HTTP_TIMEOUT`
  - `HTTP_ACCEPT_LANGUAGE`

---

## 12. How To Read The Code Before Changing It

### 12.1 If You Change Tool Behavior

Read in this order:

1. `src/tools/tool-definitions.ts`
2. `src/api/octoparse.ts`
3. `src/tools/tool-registry.ts`
4. `src/tools/middleware.ts`

### 12.2 If You Change Authentication, Identity, Or Request Scope

Read in this order:

1. `src/handlers.ts`
2. `src/utils/request-context.ts`
3. `src/auth.ts`
4. `src/api/auth.ts`
5. `src/auth/token-provider.ts`
6. `src/services/session-service.ts`

### 12.3 If You Change HTTP Client, Interceptors, Or Pooling

Read in this order:

1. `src/api/clients/http-client-factory.ts`
2. `src/api/auth.ts`
3. `src/tools.ts`
4. `src/utils/request-context.ts`

### 12.4 If You Change Redis Or Distributed State

Read in this order:

1. `src/services/session-service.ts`
2. `src/services/export-state-service.ts`
3. `src/utils/redis.ts`
4. `src/handlers.ts`
5. `src/transport.ts`

### 12.5 If You Change Logging Or Error Handling

Read in this order:

1. `src/middleware/request-logger.ts`
2. `src/middleware/error-handler.ts`
3. `src/security/secure-error-handler.ts`
4. `src/utils/logger.ts`
5. `src/tools/middleware.ts`

---

## 13. Hard Constraints

This is the most important constraint set in the repository.

### 13.1 Security And Isolation Constraints

1. Do not persist raw tokens or raw API keys to Redis.
2. Do not allow a shared HTTP client to hold fixed user authentication state.
3. Do not bind request-specific credentials into cross-request shared objects through closures.
4. Do not use parsed but unverified JWT contents for security decisions.
5. Do not write raw credentials, raw authorization headers, or sensitive response bodies into logs.

### 13.2 Architecture Constraints

1. The single source of truth for tool definitions is `src/tools/tool-definitions.ts`.
2. The tool execution model should continue to rely on lazy `getApi()` creation.
3. Do not introduce a second parallel request-context abstraction.
4. Configuration only counts as shipped when it is wired into the runtime path.
5. Do not keep expanding the external tool surface; the default direction is convergence.

### 13.3 Tool Simplification Constraints

1. Do not add new fine-grained tools by default.
2. Prefer strengthening existing higher-level tools through internal encapsulation.
3. Prefer reducing description length over increasing description length.
4. Prefer moving business details into the implementation layer.
5. If merge conflicts involve tool design, prefer the solution with fewer and higher-level tools by default.

### 13.4 Documentation Constraints

1. Documentation must stay close to the current code.
2. Do not turn documentation into aspirational architecture marketing.
3. Do not present temporary ideas, partial drafts, or historical designs as current mainline facts.
4. Do not silently remove or weaken the security review protocol below.

---

## 14. Validation Expectations

### 14.1 Minimum Validation

For any non-documentation change, run at least:

- `npm run build`

### 14.2 Reality Check

The current repository state must be described honestly:

- `npm test` is only a placeholder
- mainline validation currently depends on build success and targeted checks

### 14.3 Extra Validation By Change Type

If you change tools or schemas:

- verify schema and description still match
- verify handler results are still serializable
- verify the tool convergence direction was not accidentally reversed

If you change authentication, sessions, pooling, or request context:

- analyze user isolation explicitly
- analyze credential lifecycle explicitly
- analyze shared-state contamination explicitly
- analyze session recovery behavior explicitly

If you change logging or error handling:

- check whether new sensitive fields entered logs
- check whether external error exposure increased
- check JSON-RPC and MCP format compatibility

---

## 15. Documentation Standard For This Repository

When writing project introductions, architecture guides, or repository rules for this project, use the following style:

- explain project identity before architecture
- explain facts before goals
- explain mainline files before abstractions
- write constraints as explicit rules
- isolate high-risk areas clearly
- isolate tool strategy clearly

A good project-level agent guide for this repository should answer at least:

- what system this is
- where the current mainline code lives
- what the most important current design direction is
- what must not be changed casually
- what direction tools should evolve toward
- what should be preferred during merge conflict resolution

---

## 16. Known Easy Mistakes

These are common agent mistakes in this repository:

1. assuming that because there are many tools today, the correct future direction is to keep adding more
2. treating very long descriptions as necessary instead of treating them as a sign of poor boundary design
3. treating session recovery as recovery of the original authentication state
4. assuming that because a field exists in `AppConfig`, the capability is already active
5. optimizing a shared HTTP client into a permanently authenticated client
6. keeping old tools forever during convergence work just because removing them feels risky

---

## 17. Post-Modification Security Review Protocol

Mandatory checkpoint after modifying critical infrastructure code such as architecture, caching, middleware, authentication, connection pooling, or request context propagation.

### When To Trigger

Perform this review immediately after any modification to:

- HTTP client factory and connection pooling
- authentication middleware or token management
- request or response interceptors
- caching mechanisms such as Redis, connection pools, or in-memory caches
- multi-tenant data isolation layers
- async context propagation through `AsyncLocalStorage`

### The Required Three-Point Analysis

For each critical modification, the agent must produce the following analysis.

#### 1. Warning Identification

Identify and explicitly state possible risks introduced by the change, including:

- cross-user credential contamination
- shared-state pollution between requests
- memory leaks caused by improper cleanup
- race conditions under concurrent access
- breaking changes to existing behavior
- performance degradation caused by architectural changes

#### 2. Short-Term Mitigation

Provide an immediate and actionable short-term mitigation when risks are identified, such as:

- configuration toggles to disable risky behavior
- additional validation checks
- temporary workarounds that preserve safety
- logging or monitoring to detect issues early

#### 3. Impact Analysis

Analyze the change across these dimensions:

| Dimension | Questions To Answer |
|-----------|---------------------|
| Security | Does this change preserve isolation boundaries between users? Could credentials leak across requests? Are shared resources protected correctly? |
| Performance | What is the impact on connection reuse, memory usage, and request latency under concurrency? |
| Maintainability | Does this change add technical debt? Is the code clearer or harder to reason about? What testing is now required? |

### Review Output Format

```markdown
## Post-Modification Review: [Feature Or Change Name]

### 1. Warnings
- [Warning 1]: [Specific risk identified]
- [Warning 2]: [Specific risk identified]

### 2. Short-Term Mitigation
- [Action 1]: [Immediate fix or safeguard]
- [Action 2]: [Monitoring or logging to add]

### 3. Impact Analysis
| Aspect | Before | After | Risk Level |
|--------|--------|-------|------------|
| Security | [State] | [State] | Green / Yellow / Red |
| Performance | [State] | [State] | Green / Yellow / Red |
| Maintainability | [State] | [State] | Green / Yellow / Red |

### Recommendation
[Proceed / Proceed with caution / Revert and redesign]
```

### Example Application

Scenario: modifying `http-client-factory.ts` to enable connection pooling.

```markdown
## Post-Modification Review: HTTP Connection Pooling

### 1. Warnings
- Shared Axios instances may cause credential contamination if authentication becomes sticky.
- Interceptors may be registered multiple times on reused instances.
- User A authentication headers may accidentally leak into User B requests.

### 2. Short-Term Mitigation
- Disable pooling temporarily and fall back to creating uncached clients.
- Add request-level `authManager` validation inside the interceptor path.
- Log warnings if interceptor registration exceeds the expected count.

### 3. Impact Analysis
| Aspect | Before | After | Risk Level |
|--------|--------|-------|------------|
| Security | Per-request isolation | Shared-instance contamination risk | Red |
| Performance | Repeated TLS and setup overhead | Better connection reuse | Green |
| Maintainability | Simple lifecycle | More shared-state complexity | Yellow |

### Recommendation
Proceed with caution. Fix authentication binding and interceptor safety before production use.
```

### Compliance

This review is mandatory:

- before committing changes to critical infrastructure files
- before merging into `main` or `master`
- before deploying to production-like environments

Files that require this review include:

- `src/api/clients/http-client-factory.ts`
- `src/api/auth.ts`
- `src/tools/middleware.ts`
- `src/utils/request-context.ts`
- `src/security/*.ts`
- any file that contains `AsyncLocalStorage`, connection pools, or interceptors
