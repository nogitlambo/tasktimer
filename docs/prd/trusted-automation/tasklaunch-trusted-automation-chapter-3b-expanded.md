
# Trusted Automation Architecture
## Chapter 3B — TypeScript Domain Models & Zod Validation (Expanded)

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 3B of 6

---

# Purpose

This chapter defines the canonical software contracts for Trusted Automation. It establishes a strict separation between transport models, domain models, persistence entities, repository interfaces, and runtime validation.

Every external input must pass runtime validation before it becomes part of the domain model.

---

# Layered Architecture

```text
HTTP Request
    ↓
Request DTO
    ↓
Zod Validation
    ↓
Application DTO
    ↓
Domain Model
    ↓
Repository Entity
    ↓
Firestore Converter
    ↓
Firestore Document
```

Rules:

- Never expose Firestore documents directly to business logic.
- Never expose repository entities directly to the API.
- Never trust client payloads.
- Every boundary validates independently.

---

# Canonical Domain Model

The domain model represents automation behaviour independent of persistence.

```ts
export interface AutomationRule {
  id: string;
  type: AutomationRuleType;
  enabled: boolean;
  trustLevel: AutomationTrustLevel;
  priority: AutomationPriority;
  schemaVersion: number;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  entityId: string;
  entityType: AutomationEntityType;
  state: AutomationExecutionState;
  idempotencyKey: string;
  retryCount: number;
  startedAt?: string;
  finishedAt?: string;
}
```

The domain model must never include Firestore metadata.

---

# Discriminated Unions

Every polymorphic object uses a discriminator.

Example:

```ts
type AutomationRule =
  | RefreshDailyBriefRule
  | RefreshCapacityRule
  | RefreshNextBestActionRule
  | RefreshScheduleRepairRule;
```

Never rely on optional fields to distinguish rule types.

---

# DTO Strategy

Separate inbound and outbound DTOs.

```ts
interface ExecuteAutomationRequestDTO {
  ruleId: string;
  entityId: string;
  entityVersion: string;
  idempotencyKey: string;
}

interface ExecuteAutomationResponseDTO {
  executionId: string;
  state: AutomationExecutionState;
}
```

DTOs are immutable.

---

# Repository Contracts

Repositories perform persistence only.

```ts
interface AutomationRuleRepository {
  get(id: string): Promise<AutomationRule | null>;
  save(rule: AutomationRule): Promise<void>;
}

interface AutomationExecutionRepository {
  create(execution: AutomationExecution): Promise<void>;
  update(execution: AutomationExecution): Promise<void>;
  findById(id: string): Promise<AutomationExecution | null>;
  findByIdempotencyKey(key: string): Promise<AutomationExecution | null>;
}
```

Business rules belong in services, not repositories.

---

# Firestore Converters

Each entity has an explicit converter.

Responsibilities:

- Timestamp conversion
- Enum validation
- Default population
- Schema version verification
- Unknown-field tolerance
- Forward-compatible parsing

Converters must reject invalid persisted data.

---

# Serialization Rules

Persist only:

- IDs
- Enums
- ISO timestamps
- Version hashes
- Stable references

Never persist:

- Functions
- Closures
- Derived cache values
- Runtime dependency containers

---

# Zod Validation Layers

Validation occurs at four boundaries.

1. HTTP request
2. Domain construction
3. Repository write
4. Repository read

Example:

```ts
const ExecuteAutomationSchema = z.object({
  ruleId: z.string().min(1),
  entityId: z.string().min(1),
  entityVersion: z.string().min(1),
  idempotencyKey: z.string().uuid()
});
```

Business validation follows structural validation.

---

# Business Validation

Structural validity alone is insufficient.

Additional checks include:

- ownership
- trust level
- rule enabled
- entity existence
- entity version
- stale-state
- lock availability
- execution conflicts

---

# Error Model

Suggested error codes:

```text
INVALID_SCHEMA
INVALID_ENUM
MISSING_FIELD
UNSUPPORTED_VERSION
ENTITY_NOT_FOUND
ENTITY_STALE
OWNERSHIP_FAILED
LOCK_CONFLICT
RULE_DISABLED
TRUST_LEVEL_TOO_LOW
```

Expose safe diagnostics only.

---

# Version Evolution

Every persisted entity contains:

```text
schemaVersion
createdAt
updatedAt
```

Migration rules:

- Add fields as optional.
- Never remove required fields without migration.
- Preserve discriminators.
- Old readers ignore unknown optional fields.

---

# Backward Compatibility

Trusted Automation must preserve compatibility across releases.

Requirements:

- Legacy records continue parsing.
- Optional fields default safely.
- New rule types never break existing unions.
- Existing repositories continue functioning until migration is complete.

---

# Repository Testing

Unit tests:

- DTO parsing
- Domain mapping
- Converter correctness
- Enum compatibility
- Version handling
- Serialization round-trip

Integration tests:

- Firestore converters
- Repository CRUD
- Duplicate idempotency keys
- Backward-compatible reads
- Migration compatibility

---

# Codex Implementation Guidance

Implement in this order:

1. Shared enums
2. Domain interfaces
3. DTOs
4. Zod schemas
5. Firestore converters
6. Repository interfaces
7. Repository implementations
8. Validation middleware
9. Compatibility tests
10. Serialization tests

Do not implement business logic until these contracts are stable.

---

# Acceptance Criteria

- Canonical domain model exists.
- DTOs are isolated from persistence.
- Repository interfaces contain no business logic.
- Firestore converters are authoritative.
- Zod validates every external boundary.
- Business validation is separate from structural validation.
- Discriminated unions replace optional-field polymorphism.
- Schema evolution is additive.
- Backward compatibility is documented and tested.
- Codex can implement repositories directly from this specification.
