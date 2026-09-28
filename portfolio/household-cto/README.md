# Household CTO — Privacy + Approval n8n Demo

A credential-free demonstration built for a privacy-sensitive household automation brief.

## What it proves

- Accepts meeting notes through a webhook.
- Applies a deterministic privacy gate before any cloud-processing step.
- Routes obviously sensitive material to a LOCAL_ONLY result for Ollama/LM Studio processing on the home machine.
- Converts non-sensitive notes into draft action items, calendar entries, and an email draft.
- Blocks calendar writes and email sending until explicit human approval.
- Contains no credentials, API keys, or production personal data.

## Production phase

The demo deliberately does **not** pretend to be a finished household installation. A production first phase would bind the approved branch to the household's actual Notion and Google Workspace accounts, add local-model processing on the Mac mini, persistent audit logs, retries/dead-letter handling, and a plain-English runbook after the exact data boundary and priority workflow are agreed.

## Sample input

```json
{
  "source": "Fathom",
  "text": "Action: add dentist appointment to shared calendar\nFollow-up: draft email to school about Friday pickup",
  "sensitive": false
}
```

Sensitive example:

```json
{
  "text": "Medical record: ...",
  "sensitive": true
}
```

The second input never produces a cloud-action package; it returns LOCAL_ONLY.
