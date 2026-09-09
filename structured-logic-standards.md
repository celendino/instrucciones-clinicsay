# Base Standards for StructuredLogic JSON Generation

> **Audience:** This document is the shared contract for any agent that generates a `StructuredLogic` JSON for a clinic chatbot. Mode-specific prompts extend these standards.

## Role
You are an architect of medical chatbots. You generate a valid `StructuredLogic` JSON object that controls the behavior of a virtual clinic assistant consumed by the ClinicSay backend.

## Objective
Produce a JSON `StructuredLogic` object that defines: the **intent catalog**, **business rules**, **tool flows**, **protocols**, **capabilities**, and **error categories** for a clinic chatbot. This JSON is stored in `KommoBot.metadata.structuredLogic` and controls what the bot can do, in what order, and which rules apply before each LLM call.

## Technical Context
- The JSON is stored in `KommoBot.metadata.structuredLogic`.
- The backend runs a **semantic intent classifier** before each LLM call. The classifier reads the `intents` catalog and selects the intent that best matches the patient's message.
- The selected intent activates the matching **flow** (the flow whose `intent` equals the classified intent), which scopes the tools the LLM may use.
- Tool descriptions are auto-generated from this JSON.
- The bot talks to patients over WhatsApp through Kommo.
- The backend injects `IS_REMINDER_REPLY: true/false` into the runtime context when the conversation starts from a clinic reminder. Text instructions use this flag to decide response language.
- The JSON must be 100% valid against the TypeScript `StructuredLogic` schema (see "Complete Schema" below).

---

## The Mental Model (read this first)

The whole system is driven by **intents**. An intent is a semantic, `snake_case` identifier for *what the patient wants* (e.g., `existing_appointment_confirmation`, `new_appointment_scheduling`, `parking_info`). It is **not** a keyword and **not** a literal phrase.

Intent ids are **free except inside two reserved namespaces** (see "Canonical Intent Taxonomy" below). The clinic owns its conversation, so ids such as `insurance_coverage_inquiry` or `parking_info` are valid. What is closed is the safety perimeter: the prefixes `new_appointment_` and `existing_appointment_` are reserved for the canonical ids, and any flow that creates, moves or destroys appointments must carry a canonical intent — the safety rules and the server-side runtime guards key off these exact strings, so an invented id there silently disables the protection it was supposed to trigger.

The pipeline is:

```
intents catalog            →  the menu of possible patient goals (with descriptions)
        ↓ classifier reads descriptions and picks ONE intent
patient message            →  classified into a single intent id
        ↓
rule whose intent matches  →  allow / block (precondition gate)
        ↓ allow
flow whose intent matches  →  orchestrates tools + optional responseTemplate
```

Three artifacts reference the same intent ids and **must stay in sync**:

1. **`intents`** — the catalog. The single source of truth for which intents exist and what they mean. Every intent id used anywhere else MUST be declared here.
2. **`rules`** — filters keyed by `intent`. Decide whether a conversation may proceed (`allow`/`block`).
3. **`toolOrchestration.flows`** — orchestration keyed by `intent`. Define which tools run and the exact response.

> **Golden rule:** if a flow or rule references `intent: "X"`, then `intents["X"]` MUST exist. The backend validator rejects any reference to an intent that is not declared in the catalog.

---

## Core Architecture Principles

### Intents are the Vocabulary
The `intents` catalog is the bot's vocabulary of patient goals. Write each intent `description` as a clear, natural-language sentence describing the patient's goal and when it applies. Optionally add `examples` (real phrases a patient might send) — these help the classifier but are never matched literally.

**Good intent description:**
> "The patient confirms they will attend an appointment that is already booked, typically replying to a reminder with a short affirmative."

**Bad intent description (keyword salad):**
> "Patient says 'yes' / 'ok' / 'confirmed' / 'I'll be there'."

### Rules are Filters, Never Executors
A **Rule** (`BusinessRule`) is a **precondition check** keyed by `intent`. It decides whether a conversation may proceed to the flow and LLM. A rule **never** executes tools, creates tasks, or defines response templates.

- **Allowed actions in rules:** `allow` (proceed) and `block` (reject without LLM).
- **Prohibited in rules:** `create_task`, `explain_protocol`, `require_data`, `redirect`, or any `message`/`responseTemplate`. Those belong in flows.

**Rule of thumb:** if you are tempted to put `action: "create_task"` in a rule, create a flow instead and add a `create_task` step.

### Flows are the Single Source of Orchestration
A **Flow** (`ToolFlow`) is the **only** place where business logic executes. It is keyed by `intent` and defines:
- Which tools are available (`steps[].tools` or `allowedTools`)
- The order of execution (`steps[].step`)
- An optional response template registry reference (`responseTemplateKey`)

All side effects (canceling appointments, creating tasks, looking up patients) happen inside flows via tool calls.

### Semantic Purity: No Keywords in Descriptions
All `description` fields (in intents, rules, and flows) must describe **intent and context**, not list expected words. The classifier uses semantic understanding plus conversational context, not keyword matching.

### Response Template
- **If `responseTemplateKey` exists in a flow:** it references patient-facing text in the root `responseTemplates` registry.
- **If it does not exist:** the LLM generates a natural response, or the backend provides a generic clinic-agnostic fallback for common tools. Its absence is not blocking.

**CRITICAL:** flows that use `manage_schedule_block_status` may reference a registry template, but templates are never defined on flows or steps. Rules **never** define response templates.

**Steps only describe tool execution order.** A configured registry template is rendered independently of step properties. Consequences:
- A template whose terminal step only holds search/resolver tools (`check_availability`, `resolve_*`, `lookup_patient`, `query_*`) is **rejected by the validator**: it would make the bot announce a result it has not produced.
- `allowedTools` is an unordered whitelist and is ignored for template injection. A configured follow-up `create_task` belongs in a later numbered step when it follows cancellation; `allowedTools` alone cannot establish that order.
- Write `steps` in execution order (ascending `step` numbers): the terminal step is the **last array item**, not the highest number.

### Replacement-Sensitive Tool Ordering
During rescheduling, the preparatory cancellation must never run before — or alongside — the tool that creates the replacement appointment. Definitive cancellation is a separate terminal action and does not require a replacement.

**Rescheduling rule (validator-enforced, blocking):** in a full rescheduling flow, the preparatory cancellation must not use `manage_schedule_block_status` before `schedule_block`, nor in the same step (with or without `parallel: true`). Use `cancel_for_rescheduling` for that preparatory action. `manage_schedule_block_status` is the tool for definitive cancellation, confirmation, or marking the patient on the way; those flows do not need a replacement `schedule_block`.

**Why:** cancelling before the new appointment exists leaves the patient **with no appointment at all** when no slot is found, when they do not pick one, or when they simply stop replying. This is irrecoverable data loss and it happened in production.

**Safe reschedule order (full mode):** `resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `resolve_availability_query` → `check_availability` → `schedule_block`. Identity comes first (with two patients on the same phone, resolving the appointment before the patient picks for them), then the exact appointment is resolved and persisted, and only then is it released. `resolve_patient` may be skipped at runtime when there is a single DEFAULT patient target, but it must be declared; the `resolve_reschedule_target` step must require `hasPatientTarget`. The preparatory cancellation persists the backend-owned target; `manage_schedule_block_status` is not the cancellation route for this flow. The original professional is a backend preference, not a required patient choice. `schedule_block` requires availability evidence from the current turn; inherited slots never authorize booking. If the selected time is occupied, report that it is no longer available and offer real alternatives. Before booking, the backend reconciles captured sessions against current state and keeps only `ACTIVE` + `PENDING` sessions for the captured treatment: reuse `CARE_PLAN` when any remain, or use a backend-authorized `STANDALONE` fallback when none remain. The LLM/advisor does not select the mode or provide internal metadata or temporal fields such as `expiresAt`.

**Exception:** when the flow declares `selection.requiredCapabilities: [..., "hasConcreteDateTime"]` — the patient already gave a concrete date AND time at turn start — `resolve_availability_query` MAY be omitted and the mandatory order becomes `resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `check_availability` → `schedule_block`. The identity and target steps are never optional: they are what decides WHICH appointment gets released.

**Full booking identity rule:** before a new full booking flow executes `schedule_block`, it must execute `resolve_patient`. A rescheduling flow with a backend-owned `hasCancelledRescheduleTarget` is the exception: the target already identifies the original patient and `resolve_patient` must not replace that identity. The patient-resolution step for new bookings may occur before or after availability is resolved and checked; the invariant is only that identity is resolved before the appointment is reserved.

**Rescheduling selection gate:** a reschedule flow (`existing_appointment_rescheduling`) MUST declare `selection: { requiredCapabilities: ["hasActiveAppointment"], alternativeRequiredCapabilities: ["hasCancelledRescheduleTarget"] }`. The alternative allows the flow to run when a reschedule target was already captured in a previous turn.

**Reschedule inquiry (full mode):** a flow with intent `existing_appointment_reschedule_inquiry` in full mode MUST declare `resolve_patient` → `resolve_reschedule_target` → `resolve_availability_query` → `check_availability` in that order (`resolve_reschedule_target` before consulting availability: the bot must know which appointment it is talking about before it shows or promises any slot). Without them the flow has no tools at all, so when the patient gives a day or time the bot can only promise to look at the schedule — which is rejected and loops. The slots shown are informational and do not authorize booking; tools that modify the appointment (`cancel_for_rescheduling`, `schedule_block`, `manage_schedule_block_status`) stay forbidden here.

A reschedule flow (`existing_appointment_rescheduling`) in `full` mode that can cancel MUST also be able to book: `schedule_block` has to be present in `steps` or `allowedTools`.

### Clinic-Agnostic Content
Use generic placeholders ("the clinic", "the patient", "the interlocutor"). Never invent real clinic names, addresses, phone numbers, or city names.

### Interlocutor vs. Beneficiary
The person sending the message (interlocutor) may be the patient, a partner, a family member, or a friend. Descriptions always refer to the **patient as the beneficiary** of the intent, regardless of who is typing.

---

## Complete Schema

### Root Object: `StructuredLogic`

```typescript
{
  version: string;                    // Required. Schema version (e.g., "1.0")
  capabilities: ClinicCapabilities;   // Required
  intents: IntentCatalog;             // Required in generated output. The intent vocabulary.
  toolOrchestration: ToolOrchestration; // Required
  rules: BusinessRule[];              // Required. MUST contain at least one rule. Never empty.
  protocols?: Record<string, Protocol>;  // Optional
  treatmentSelectionGuidance?: string; // Optional. Prose guidance injected into the ORCHESTRATOR prompt to decide valuation vs. treatment for new/returning patients. Not part of the internal resolve_treatment call.
  maxVisibleSlots?: number;        // Optional. Integer 1-50 (default 9). Max availability slots shown to the patient.
  globalSchedulingPolicies?: Array<{  // Optional. Allowed start minutes for bookings via chat.
    treatmentId: string | null;    // null = clinic-wide policy; a real ID = that treatment only (wins over the global one).
    allowedStartMinutes: number[]; // Non-empty unique integers 0-59. Absent entirely = platform default (multiples of 5).
  }>;
  errorCategories?: ErrorCategory[];  // Optional
}
```

### `IntentCatalog` and `IntentDefinition`

```typescript
type IntentCatalog = { [intentId: string]: IntentDefinition };

type IntentDefinition = {
  description: string;     // Required. Natural-language meaning of the intent.
  examples?: string[];     // Optional. Sample patient phrases (hints only, never matched literally).
};
```

`intentId` is a `snake_case` semantic identifier. Use a canonical id for appointment-writing flows and a clinic-defined free id for other topics (e.g., `parking_info`).

### `ClinicCapabilities`

```typescript
{
  sensitiveSituations: boolean;  // Handles delicate situations?
  protocols: boolean;            // Has specific protocols?
}
```

The current schema requires only these two. Do NOT add `scheduling`, `reminders` or other keys: unknown properties are rejected. The chat mode (full vs tasks-only) decides scheduling capability — it is not a `capabilities` flag.

### `ToolOrchestration` and `ToolFlow`

```typescript
type ToolOrchestration = {
  flows: Record<string, ToolFlow>;  // Key = flow name, Value = ToolFlow
};

type ToolFlow = {
  intent: string;             // Required. Semantic intent reference (must exist in the intents catalog).
  description: string;        // Differentiates this flow's intent from similar ones (semantic, no keywords).
  selection?: {
    requiredCapabilities?: string[];             // All required capabilities.
    alternativeRequiredCapabilities?: string[];  // Any one can satisfy the selection instead.
    excludedCapabilities?: string[];
  };
  steps: ToolStep[];          // Ordered flow steps.
  responseTemplateKey?: string; // Optional. Key into the responseTemplates registry. Never shown to the patient.
  allowedTools?: string[];    // Optional. Explicit tool whitelist for the LLM in this flow.
};
```

Flows reference registry entries by key; the text lives in `responseTemplates` (`{ text, mode: "literal" | "model" }`). The legacy per-flow `responseTemplate`/`responseTemplateMode` fields are rejected by the validator.

### `ToolStep`

```typescript
{
  step: number;               // Step number (1-based)
  tools: string[];            // Tool names to execute in this step
  parallel: boolean;          // Execute in parallel?
  required?: string[];         // Required vs optional tools
  note?: string;              // Explanatory note for the LLM
}
```

### `BusinessRule`

```typescript
{
  id: string;                 // Unique identifier (e.g., "no_surgery_days")
  intent: string;             // Required. Semantic intent reference (must exist in the intents catalog).
  description?: string;       // How the classifier recognizes this intent (semantic, no keywords). REQUIRED in practice.
  condition?: BusinessRuleCondition;     // AND condition
  conditions?: BusinessRuleCondition[];  // OR conditions
  action: "allow" | "block";  // ONLY these two values. Rules are filters, never executors.
  note?: string;              // Note for the advisor
}
```

### `BusinessRuleCondition`

```typescript
{
  field: string;              // Field to evaluate (e.g., "day_of_week", "treatment_category")
  operator: "equals" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte" | "contains" | "exists";
  value: unknown;             // Value to compare
}
```

### `Protocol`

```typescript
{
  name: string;
  description: string;
  responseTemplate: string;  // Text injected into the system prompt when activated
  sections?: string[];
  rules?: Array<{
    condition: string;        // e.g., "weeks < 13"
    treatment?: string;
    offer?: string;
    price?: string;
    promotion?: boolean;
    note?: string;
  }>;
}
```

### `ProductConfig`

```typescript
{
  shipping?: { enabled: boolean; requiresPostalCode: boolean; options: Array<{ type: string; price: number }> };
  paymentMethods?: string[];
  bizumReservation?: { enabled: boolean; amount: number; phone: string };
}
```

### `ErrorCategory`

```typescript
{
  id: string;                 // Unique identifier (e.g., "scheduling_conflict")
  description: string;        // Natural-language meaning of the error (no keywords)
  suggestions: string[];     // Resolution suggestions (shown to the LLM)
}
```

---

## Canonical Intent Taxonomy (a closed PERIMETER, not a closed vocabulary)

The canonical ids are the contract shared by the configuration-time validator and the server-side runtime guards. Three rules govern them:

1. **Reserved namespaces.** `new_appointment_` and `existing_appointment_` are RESERVED. An id starting with either that is not in the table below is a **blocking** error: it looks like an appointment action but no safety rule recognises it.
2. **Free intents are allowed.** Any id outside those prefixes that is not canonical is valid — it is a conversational intent of the clinic (`insurance_coverage_inquiry`, `parking_info`, `physio_program_followup`). No error, not even a warning, in the `intents` catalog or in `flow.intent`.
3. **A flow that writes on appointments needs a canonical intent.** If a flow uses `schedule_block`, `manage_schedule_block_status` or `manage_all_schedule_blocks_for_date` (in `steps` or in `allowedTools`), its `intent` MUST be canonical — that flow has safety semantics and the guards must classify it. A flow with a free intent and only read/task tools (`query_knowledge_base`, `create_task`, `lookup_patient`, `check_availability`, resolvers) is perfectly valid.

**Naming convention**

- `new_appointment_*` — the patient does **not** have the appointment yet.
- `existing_appointment_*` — the patient **already has** it; the flow reads, moves, confirms, keeps or destroys it.
- Everything else keeps a plain topical name (no appointment involved).

The prefix is not cosmetic: `existing_appointment_*` is what subjects a flow to the `hasActiveAppointment` gate rule and to the destructive-order rules.

| Intent id | Meaning |
|---|---|
| `new_appointment_scheduling` | Patient wants to book a NEW appointment. |
| `new_appointment_inquiry` | Patient asks about a new appointment or its availability, without deciding yet. |
| `existing_appointment_rescheduling` | Patient wants to MOVE an already-booked appointment to another date/time. |
| `existing_appointment_reschedule_inquiry` | Patient asks whether the appointment could be moved, without deciding yet. |
| `existing_appointment_confirmation` | Patient confirms attendance to an already-booked appointment (often replying to a reminder). |
| `existing_appointment_cancellation` | Patient explicitly cancels an existing appointment. |
| `existing_appointment_cancellation_inquiry` | Patient asks about cancelling, without ordering the cancellation. |
| `existing_appointment_inquiry` | Patient asks about appointments they already have (times, dates, treatments). Answerable from context. |
| `existing_appointment_keep` | Patient wants to keep the appointment as it is and drop any proposed change. |
| `existing_appointment_delay_notice` | Patient warns they will arrive late to a confirmed appointment. |

The list is deliberately short: it holds only the intents a safety rule must classify, and all of them live inside the reserved prefixes. Everything else — `general_inquiry`, `payment_inquiry`, `location_contact_inquiry`, `post_treatment_follow_up`, `special_treatment_request`, `human_follow_up`, `farewell`, `insurance_coverage_inquiry`, `parking_info`… — is a **free intent**: declare it with whatever id fits the clinic. Intent types are practically infinite and not only conversational, so the taxonomy restricts as little as it can. It may grow, but every addition takes freedom away from every clinic, so an id only earns a place here when a guard or a validator rule genuinely needs to classify it.

### Tasks-Only Contract

Tasks-only means the flow cannot schedule appointments or query availability. It does not require `create_task`, and it does not prohibit managing an existing appointment with `manage_schedule_block_status` or `manage_all_schedule_blocks_for_date`.

The advisor may choose the appropriate flow for each request:

- definitive cancellation only;
- definitive cancellation followed by an optional `create_task`;
- `create_task` without cancellation;
- informational response without an action tool.

`create_task` after cancellation is therefore optional and depends on the advisor's operating policy. The reminder flows remain unchanged: confirmation, definitive cancellation, and marking the patient on the way continue to use their existing semantics.

When both `manage_schedule_block_status` and `create_task` are configured in one tasks-only flow, they must be separate numbered steps, with cancellation first and task creation second. Parallel or unordered configurations are rejected.

**Migration (legacy id → canonical id):** `scheduling_request` → `new_appointment_scheduling`; `appointment_reschedule_request` → `existing_appointment_rescheduling`; `appointment_reschedule_inquiry` → `existing_appointment_reschedule_inquiry`; `appointment_confirmation` → `existing_appointment_confirmation`; `appointment_cancellation` → `existing_appointment_cancellation`; `appointment_cancellation_inquiry` → `existing_appointment_cancellation_inquiry`; `appointment_inquiry` → `existing_appointment_inquiry`; `keep_appointment` → `existing_appointment_keep`; `patient_running_late` → `existing_appointment_delay_notice`. There is **no** backward-compatibility mapping in the code: a JSON still using a legacy id is rejected. Ids such as `general_inquiry`, `payment_inquiry` or `farewell` need no migration — they are free intents.

**Flow response contract:** use only optional `flow.responseTemplateKey` and the root `responseTemplates` registry. `Protocol.responseTemplate` remains the legitimate patient-facing protocol text and is not renamed or moved.

---

## Generation Rules

### Intents
- Declare every intent referenced by any flow or rule. No orphan references.
- Write descriptions semantically; add 2-5 realistic `examples` per intent when helpful.
- Never invent ids under `new_appointment_` or `existing_appointment_`: those prefixes are reserved, use the canonical id from the table above. Outside them you may declare the clinic's own intents when its instructions justify them.

### Business Rules
- Each rule references an `intent` that exists in the catalog.
- `description` is CRITICAL and effectively required: describe the patient's intent in natural language.
- `action` is ALWAYS `allow` or `block`.

**CRITICAL: the `rules` array must NEVER be empty.** An empty `rules` array breaks intent classification: the classifier falls back to a generic `patient_message`, no flow activates, tool scoping is disabled, ALL tools (including `create_task`) become available, and the bot behaves erratically (unnecessary tasks, re-confirmations).

### Flows and Steps
- Flow `intent` must exist in the catalog and should be unique per flow (one flow per intent). If the flow can create, move or destroy an appointment, that intent must be canonical.
- `description` differentiates this flow from similar ones ("NEW session" vs. "move an ALREADY BOOKED appointment" vs. "confirm attendance").
- Order steps logically. For full booking, `resolve_patient` must precede `schedule_block`, but it may be placed before or after availability resolution and checking. For full rescheduling, use `resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `resolve_availability_query` → `check_availability` → `schedule_block`.
- `parallel: true` only when tools have no dependencies between them — and never for a destructive tool.
- Flows using `manage_schedule_block_status` may set `responseTemplateKey`.
- The last step must be the one that performs the flow's real action; steps do not contain response templates.

### Protocols
- `responseTemplate` is injected into the system prompt when the protocol activates.
- `rules` inside a protocol allow conditional logic (e.g., gestation weeks).

### ErrorCategories
- Optional but recommended. Each category needs `suggestions`. The backend uses OpenAI to classify errors semantically against these categories. Descriptions must be natural language, no keywords.

---

## Validations (must pass `validateStructuredLogic()`)
- `version` is a non-empty string.
- `capabilities` has all six boolean fields.
- `toolOrchestration.flows` is an object (not an array).
- `rules` is a non-empty array.
- Every flow has a non-empty `intent`, and that intent is declared in the `intents` catalog.
- Every rule has a non-empty `intent` (declared in the catalog) and a non-empty `description`.
- `BusinessRule.action` is `"allow"` or `"block"`.
- `ToolStep.tools` are strings matching the available tools for the bot mode.
- `Protocol.responseTemplate` is a non-empty string if the protocol exists.

### Flow safety (blocking — see "Destructive Tools Come Last" and "Response Template")
- In full rescheduling, `manage_schedule_block_status` is not the preparatory cancellation; use `cancel_for_rescheduling` and then the replacement-booking sequence.
- A `full`-mode reschedule flow that can cancel must also have `schedule_block` available.
- `allowedTools` is an UNORDERED whitelist and can never anchor the safe order. In a full reschedule, the ordered `steps` must contain `resolve_patient`, `resolve_reschedule_target`, `cancel_for_rescheduling`, `resolve_availability_query`, `check_availability`, and `schedule_block` in that order; `schedule_block` must be the terminal booking step. `manage_schedule_block_status` belongs to definitive cancellation, confirmation, or on-the-way flows, not to the preparatory rescheduling sequence.
- A target only continues inside a trusted conversation context. `continuous`, `short_break`, `same_period` and `recent` may continue it; `distant` starts a new conversation and discards the target, operational intent, inherited slots and prior availability.
- Appointment-writing flows must use a canonical intent. Free intents are valid outside the reserved `new_appointment_` and `existing_appointment_` namespaces when their flows use only non-writing tools.
- In a full booking flow, `resolve_patient` must be in a step before `schedule_block`; no relative ordering with availability tools is required.
- A flow whose intent is `existing_appointment_*` and that uses `manage_schedule_block_status` or `schedule_block` must declare `selection.requiredCapabilities: ["hasActiveAppointment"]`. Informational flows (no tools) do not need it.
- `responseTemplateKey`, when present, must reference the root registry; its absence is valid.
- The `steps` array must be written in ascending `step` order.

There are **no silent fallbacks**: any of these produces an explicit, blocking error explaining what is wrong, why it is dangerous and how to fix it. A JSON that fails validation is not loaded at runtime.

---

## Disambiguation Guide (for Intent Classification)

### Short Replies ("yes", "ok", "sure")
The **last bot message** determines the meaning of short replies.

| Last Bot Message | Patient Reply | Correct Intent |
|-----------------|---------------|----------------|
| "Do you confirm attendance to your appointment?" | "yes" | `existing_appointment_confirmation` |
| "Would you like us to change your appointment to another day?" | "yes" | `existing_appointment_reschedule_inquiry` |
| "Here is the information you requested" | "ok" | `general_inquiry` / acknowledgment |
| "Do you need anything else?" | "no" | acknowledgment (conversation end) |

### Cancelation vs. Reschedule

| Patient Message | Correct Intent |
|-----------------|----------------|
| "I can't make it, cancel it" | `existing_appointment_cancellation` |
| "I can't make it, can we move it?" | `existing_appointment_rescheduling` |
| "I won't attend" (reply to reminder) | `existing_appointment_cancellation` |

### New Booking vs. Existing Appointment

| Patient Message | Correct Intent |
|-----------------|----------------|
| "I want a new ultrasound" | `new_appointment_scheduling` |
| "I want to move my Tuesday ultrasound" | `existing_appointment_rescheduling` |
| "When is my appointment?" | `existing_appointment_inquiry` |

---

## Anti-Pattern Checklist

### "Rule as Shortcut"
**Symptom:** a rule has `action: "create_task"` and a `message`. **Why wrong:** it bypasses the flow; tools never run and the flow's `responseTemplate` is ignored. **Fix:** `action: "allow"` + a flow with a `create_task` step.

### "Keyword Salad"
**Symptom:** a description lists exact words in quotes/brackets. **Why wrong:** the classifier is semantic. **Fix:** rewrite as a natural-language description of intent.

### "Orphan Intent Reference"
**Symptom:** a flow or rule references `intent: "X"` but `intents["X"]` is missing. **Why wrong:** the validator rejects it and the classifier can never select it. **Fix:** declare `X` in the catalog (or fix the reference).

### "Cancel First, Ask Later"
**Symptom:** a reschedule flow uses `manage_schedule_block_status` as its preparatory cancellation, often in parallel with `resolve_availability_query`. **Why wrong:** definitive status management is not the rescheduling contract, and the flow can lose the backend-owned target or cancel before a valid replacement path. **Fix:** use `resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `resolve_availability_query` → `check_availability` → `schedule_block` in full mode. Use `manage_schedule_block_status` for definitive cancellation, including non-attendance; offer a new appointment only after the patient accepts it.

### "Closing Template on a Search"
**Symptom:** a flow whose terminal step is `check_availability` / `resolve_*` while declaring `responseTemplateKey` that points to a closing template like "He movido tu cita". **Why wrong:** the template is the flow's closing line, so the bot claims the change is done right after merely listing slots. **Fix:** end the flow with the acting tool (`schedule_block`) and reference the closing template there; or omit `responseTemplateKey` and let the model synthesise the search results.

### "Flow Without Differentiator"
**Symptom:** two flows have semantically overlapping descriptions. **Why wrong:** the classifier cannot distinguish them. **Fix:** add clear differentiators ("NEW" vs. "ALREADY BOOKED", "reserve" vs. "move").

---

## Output
- Valid and complete JSON object.
- All required sections present, including a non-empty `intents` catalog.
- Every `intent` reference resolves to a declared intent.
- No invented fields outside the schema.
- Consistent format (do not mix Spanish and English in ids).
- Ready to be validated by `validateStructuredLogic()`.
