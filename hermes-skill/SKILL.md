---
name: flashcards
description: Create spaced-repetition flashcards from language-coaching sessions (EN/ES) in the flashLang API
---

# Flashcards skill

Use this skill during language-coaching sessions to capture vocabulary and grammar structures
worth reviewing later. Cards are reviewed by the user on a separate PWA — this skill only
**creates** cards, it never reviews or edits them.

## When to create a card

Create a card only when one of these is true:
- An error was corrected **twice or more** in the same session (recurring, not a one-off slip).
- The user **explicitly asked** to remember a word, phrase, or structure.
- Something was flagged **"à retenir"** during the session.

Do not create a card for every correction or every new word — this is a quality gate, not a
transcript. **Cap: 5 cards per session.** If more than 5 items qualify, keep the 5 most
important and drop the rest; over-generation is treated as a bug, not thoroughness.

## Choosing basic vs cloze

- **`cloze`**: grammatical structures shown in context (verb tenses, subjunctive, word order,
  phrasal verbs used in a sentence). Use `{{c1::...}}` around the part being tested, e.g.
  `text: "If I {{c1::had known}}, I would have called you."`
- **`basic`**: raw lexicon (a single word/expression and its translation or definition) with no
  useful surrounding sentence. Use `front`/`back`.

Always fill in `context` with the sentence from the session where the item came from — this is
the pedagogical traceability the whole system is built around; don't leave it empty for
convenience.

## Before creating: check for duplicates

Call `list_recent_cards` for the relevant `language` before adding a card if you're unsure
whether something similar was already captured recently (e.g., earlier in the same session, or a
past session on the same recurring error). The API also rejects exact duplicates itself (see
below), so this is a courtesy check, not the only safety net.

## Tools

### `create_flashcard`
`POST {API_BASE_URL}/cards`
Headers: `Authorization: Bearer {HERMES_TOKEN}`

```json
{
  "type": "basic | cloze",
  "front": "string, required for basic",
  "back": "string, required for basic",
  "text": "string, required for cloze, uses {{c1::...}} syntax",
  "language": "en | es",
  "context": "string, the originating sentence — always fill this in",
  "source_session": "string, an identifier for this coaching session",
  "tags": ["phrasal-verb", "subjonctif", "faux-ami", "..."]
}
```

Returns `201` with the created card, or **`409 Conflict`** if a card with the same (normalized)
`front`/`text` already exists in that `language`. Treat 409 as success, not an error — it means
the card is already tracked. Don't retry, don't ask the user, just skip it silently or note it
internally.

### `create_flashcards_batch`
`POST {API_BASE_URL}/cards/batch`
Same auth. Body: `{"cards": [ ...same shape as above... ]}`. Use this at the end of a session to
create everything qualified in one call instead of one request per card. Each card in the batch
can independently return a 409 — the ones that succeeded are still created.

### `list_recent_cards`
`GET {API_BASE_URL}/cards/recent?lang={en|es}&limit=20`
Same auth. Returns the most recently created cards, newest first. Use this to check for
near-duplicates before creating, and to build the end-of-session confirmation message.

## End of session

If any cards were created, tell the user briefly: `"Cartes ajoutées : {n}"` followed by a short
list (front/back or cloze text per card). If nothing qualified, say nothing — don't report a
null result every session.
