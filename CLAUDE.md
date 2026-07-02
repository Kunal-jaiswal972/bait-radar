# AI Agent Directives (AGENTS.md / .cursorrules)

This file contains the strict operational guidelines for any AI coding assistant working in this repository.

> **CRITICAL INSTRUCTION:**  
> Read and apply these rules **before generating any code**. Prioritize clarity, maintainability, safety, and architectural discipline over cleverness or unnecessary abstraction. Think like a **Principal Engineer**.

---

# 1. Agent Workflow & Communication Protocol

## Plan Before Acting

- Think holistically before implementation.
- Review the complete task context.
- Draft a brief implementation plan.
- If the task significantly changes architecture, infrastructure, or folder structure, **wait for confirmation before making changes.**

## Iterative Execution

- Implement one feature at a time.
- Do not refactor unrelated code unless explicitly requested.
- Avoid cosmetic changes outside the requested scope.

## No Rogue Files

- Do **not** create new files or directories unless absolutely necessary.
- Follow the repository's existing architectural patterns.

## Zero-Error Policy

- Code must compile cleanly.
- No TypeScript errors.
- No lint errors.
- Never suppress errors using:
  - `@ts-ignore`
  - `eslint-disable`
  - `any`
  - non-null assertions (`!`)
- Fix the root cause instead.

## Response Format

After completing a task, output **only** a concise changelog.

Example:

```text
✅ Changed: src/utils/constants.ts
- Added MAX_TIMEOUT constant.

✅ Changed: src/services/authService.ts
- Added refresh token validation.
```

No introductions.
No explanations.
No internal reasoning.

---

# 2. Repository Layout & Architecture

## Separation of Concerns

Never mix responsibilities inside a file.

Separate:

- Types
- Interfaces
- Constants
- Business logic
- API clients
- Validation schemas

Recommended structure:

```
feature/
├── components/
├── hooks/
├── services/
├── repositories/
├── modules/
├── constants/
├── types/
├── validators/
└── utils/
```

Files exceeding roughly **300 lines** should be split.

---

## Shared Types

Shared types belong in:

```
types/
```

or

```
feature.types.ts
```

---

## Shared Constants

Never hardcode values repeatedly.

Store:

- magic strings
- timeouts
- regex
- limits
- default values
- enums

inside

```
constants/
```

---

## Reusable UI

Large reusable UI must never remain inside pages.

Extract immediately into

```
components/shared/
```

---

## Naming Conventions

### Variables

```ts
userId;
maxRetries;
```

### Functions

```ts
fetchUser();
createInvoice();
```

### Files

```
authService.ts
useStream.ts
userRepository.ts
```

### Classes / React Components

```
UserCard.tsx
AuthProvider.tsx
PaymentService.ts
```

---

# 3. Backend Industrial Standards

## Architecture

Always maintain this flow:

```text
Routes / Controllers
        │
        ▼
Services (Business Workflow)
        │
        ├────────► Modules (Pure Functions)
        │
        ▼
Repositories (Data Access)
        │
        ▼
Database / Storage
```

Never violate this direction.

---

## Routes / Controllers

Responsibilities:

- Parse requests
- Validate schemas
- Authentication
- Authorization
- Return HTTP responses

Never:

- Query databases
- Implement business logic
- Call external APIs directly

Controllers must remain thin.

---

## Services

Services own:

- Business workflows
- Transactions
- Orchestration
- Domain rules
- Calling repositories
- Calling modules

---

## Repositories

Repositories own only infrastructure.

Examples:

- SQL
- MongoDB
- Redis
- Blob Storage
- S3
- External persistence

No business logic.

---

## Modules

Modules are:

- Pure
- Deterministic
- Framework independent

Never import:

- Express
- FastAPI
- Prisma
- Mongoose
- SQL clients

Modules should have no side effects.

---

## Database Rules

### Prevent N+1 Queries

Never:

```ts
for (...) {
    await db.find(...)
}
```

Prefer:

- `$in`
- `WHERE IN`
- `bulkWrite`
- batching

---

### Connection Lifecycle

Never create database connections inside routes.

Use shared application pools.

---

### Pagination

Every potentially large endpoint must paginate.

Use:

- Cursor pagination for high-volume feeds
- Offset pagination for stable datasets

---

## CPU Intensive Tasks

Never block the event loop.

Offload:

- ML inference
- Image processing
- OCR
- Compression
- Encryption

Use:

- worker threads
- queues
- background workers

---

## Idempotency

Critical write operations must support:

- idempotency keys
- transactional safety

Especially:

- payments
- credits
- purchases
- balance updates

---

# 4. Frontend Standards

## State Isolation

### Server State

Use:

- TanStack Query
- Apollo
- SWR

Never duplicate server state into local React state.

---

### Global State

Use:

- Zustand
- Redux

Only for:

- preferences
- authentication
- layouts
- multi-page workflows

---

### Local State

Use only for:

- dialogs
- toggles
- active tabs
- temporary UI

---

## Performance

Use:

- `useMemo`
- `useCallback`
- `React.memo`

Avoid unnecessary re-renders.

---

## Large Lists

Never:

```tsx
items.map(...)
```

inside huge scrollable views.

Use virtualization.

Examples:

- react-window
- react-virtual
- FlashList

---

## Effects

Every `useEffect` must clean up:

- listeners
- timers
- polling
- subscriptions
- pending async work

---

## Styling

Prefer Tailwind.

Example:

```tsx
className="flex items-center gap-4"
```

Avoid inline styles unless values are dynamically computed.

Use

- clsx
- tailwind-merge

for conditional classes.

---

# 5. Defensive Programming

Assume every external input is invalid.

---

## Object Access

Always use optional chaining.

Good:

```ts
user?.profile?.email;
```

Bad:

```ts
user.profile.email;
```

---

## Defaults

Use

```ts
??
```

instead of

```ts
||
```

Example:

```ts
count ?? 0;
```

not

```ts
count || 0;
```

---

## Arrays

Never:

```ts
items[0];
```

Instead:

```ts
items?.[0];
```

or verify length first.

---

## Guard Clauses

Handle invalid input immediately.

Example:

```ts
if (!user) {
  return;
}
```

---

## Function Parameters

Functions with **3+ parameters** must accept an options object.

Good:

```ts
createUser({
  name,
  email,
  role,
});
```

Bad:

```ts
createUser(name, email, role);
```

---

## Magic Values

Never write:

```ts
5000;
```

Use:

```ts
DEFAULT_TIMEOUT;
```

---

## Documentation

Delete:

- dead code
- commented-out code
- outdated comments

Only explain **why**, never **what**.

---

# 6. Type Safety

## No `any`

Use:

```ts
unknown;
```

and narrow it.

---

## Explicit Types

Every function requires explicit:

- parameter types
- return types

---

## No Non-Null Assertions

Never:

```ts
user!.id;
```

Handle undefined properly.

---

## Schema Validation

Everything entering the application must be validated.

Examples:

- request bodies
- query params
- env vars
- webhooks

Recommended:

- Zod
- Pydantic

Flow:

```text
Untrusted Input
        │
        ▼
Schema Validation
        │
        ▼
Trusted Types
```

---

# 7. Security

## Secrets

Never hardcode:

- API keys
- passwords
- tokens
- private endpoints

Use configuration.

---

## Centralized Config

Never use:

```ts
process.env;
```

inside business logic.

Instead:

```
config.ts
```

loads and validates all environment variables once.

---

## Sanitization

Always sanitize user input to prevent:

- XSS
- injection
- parameter poisoning

---

# 8. Error Handling

Never swallow errors.

---

## Controller

- Catch transport errors
- Return predictable HTTP responses

---

## Service

- Add context
- Attach tracking IDs
- Rethrow typed errors

---

## Repository

Translate infrastructure errors into domain errors.

Log structured context.

---

## UI

Use Error Boundaries.

Display graceful fallback UI.

---

## Logging

Always include:

- IDs
- action
- operation
- error code
- request context

Never expose:

- stack traces
- SQL
- internal implementation details

---

## Async UI

Disable user interactions during pending requests.

Prevent duplicate submissions.

---

# 9. Testing & Git Hygiene

## Testability

Extract business logic into pure functions.

Avoid coupling logic to:

- HTTP
- React
- Express
- FastAPI

---

## Commit Messages

Use Conventional Commits.

Examples:

```text
feat: add payment webhook validation

fix: resolve duplicate invoice creation

refactor: split auth service

docs: update architecture guide

test: add user repository tests

chore: upgrade dependencies
```

Subject lines should remain under **72 characters**.

---

# 10. Core Principles

Before generating code, ask yourself:

- Is this the simplest correct solution?
- Does it follow the repository architecture?
- Is every layer respecting its responsibility?
- Is every external input validated?
- Is every function fully typed?
- Are magic values extracted?
- Can this code be tested in isolation?
- Will this scale in production?
- Would a Principal Engineer approve this implementation?

If any answer is **No**, revise the implementation before proceeding.
