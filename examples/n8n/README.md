# Household n8n Privacy + Approval Demo

**Status:** portfolio demo, not a prior client deployment.

This small workflow demonstrates the safety core I would use for a private household automation stack where n8n coordinates local AI, cloud services, calendars, notes, documents, and email drafts.

## What it demonstrates

- A single webhook intake for household requests.
- A deterministic privacy policy step that forces sensitive text to a **local** route.
- A human-approval gate for mutating actions such as sending email, creating events, updating Notion, deleting, purchasing, or sharing externally.
- A structured audit record containing route and approval state.
- No credentials, private data, or destructive actions are included.
- The demo **does not execute external actions**. It returns the safe execution plan only.

## Why this boundary matters

A household system should not treat "AI can do it" as permission to do it. The intended production pattern is:

```
request
  -> classify sensitivity
  -> choose local/cloud boundary
  -> generate proposed action
  -> require owner approval when state changes
  -> execute through client-owned credentials
  -> log result and recovery information
```

For a Mac mini setup, sensitive content can be routed to a client-owned Ollama or LM Studio endpoint. Only the minimum non-sensitive payload should cross to cloud services where the household policy permits it.

## Import

Import `household-privacy-approval-demo.json` into n8n. The workflow is inactive by default.

Example request:

```json
{
  "requestId": "demo-001",
  "text": "Draft an email summarizing tomorrow's school pickup plan",
  "action": "send_email",
  "destination": "cloud",
  "approved": false
}
```

The result will mark the action as blocked pending human approval. Content matching sensitive patterns is forced to the local route.

## First paid phase I would propose

1. Agree on the household data boundary: local-only, cloud-allowed, and prohibited categories.
2. Connect one daily-use loop end to end (for example: document/note intake -> local AI -> Notion/calendar/email draft).
3. Keep outbound or state-changing actions behind explicit approval.
4. Add logs, error handling, backup/export instructions, and a plain-language runbook.
5. Test against agreed acceptance cases before adding more automations.

This demo is intentionally small so the important boundary is inspectable rather than hidden inside a large showcase.
