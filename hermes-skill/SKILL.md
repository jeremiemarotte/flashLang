---
name: flashcards
description: Create spaced-repetition flashcards for language and cultural knowledge from coaching sessions (EN/ES) in the flashLang API
---

# Flashcards skill

> This file is baked into the flashLang API image and served live at `GET {API_BASE_URL}/skill.md`.
> Fetch it from there rather than keeping a locally cached copy — the API and this skill are
> deployed as two separate Docker stacks (Dockge), and a stale local copy is exactly the kind of
> silent drift this endpoint exists to prevent.

Use this skill during language-coaching sessions to capture vocabulary, grammar structures, and
cultural knowledge worth reviewing later, and to remove cards that shouldn't have been created.
Cards are **reviewed** by the user on a separate PWA — this skill never touches review/rating,
only creation and deletion.

## When to create a card

Create a card only when one of these is true:
- An error was corrected **twice or more** in the same session (recurring, not a one-off slip).
- The user **explicitly asked** to remember a word, phrase, or structure.
- Something was flagged **"à retenir"** during the session.
- A **cultural fact** relevant to the language(s) being learned came up and is worth retaining —
  same bar as the above (explicitly asked, flagged "à retenir", or clearly significant), not every
  interesting tangent. Use `domain: "culture"` for these (see "Domains" below).

Do not create a card for every correction or every new word — this is a quality gate, not a
transcript. **Cap: 5 cards per session, shared across language and culture cards combined** — not
5 of each. If more than 5 items qualify across both domains, keep the 5 most important and drop
the rest; over-generation is treated as a bug, not thoroughness.

**Exception — pure remediation sessions**: if the session is driven by your existing remediation
rules (an error marked 🔴 at 6+ occurrences in your tracking), the cap raises to **10 cards** for
that session. Remediation items are already-confirmed, high-priority gaps, not exploratory
capture, so the normal quality gate doesn't apply the same way. Outside of a remediation session,
the cap stays at 5.

## Avoid double-tracking with your existing manual SR system

You already run a manual spaced-repetition schedule (J+2/J+7/J+21) outside of this app. Before
scheduling a manual retest for an item, check whether flashLang already tracks it and is handling
the scheduling itself — otherwise you end up re-testing items the app has already confirmed are
solid, on top of what FSRS is already doing:
- Call `get_due_cards` for the session's language to see what's actually due right now.
- Call `get_card` on a specific card if you need to check its real state (`reps`, `lapses`,
  `stability`, `due`) before deciding it needs a manual retest.

If an item is tracked in flashLang and isn't due yet, trust the app's FSRS schedule instead of
also programming a manual J+2/J+7/J+21 retest for the same item.

## Domains: language vs culture

Every card has a `domain`: `"language"` (default, omit the field) or `"culture"`. This is separate
from `type` (basic/cloze) and from `language` (en/es) — a cultural fact still belongs to a
language (`language: "es"` for a fact about Spain/Latin America, `language: "en"` for
Anglophone culture), it's just tagged as knowledge rather than a language mechanic. Dedup, the
due-cards list, and `list_recent_cards` are all scoped per `(language, domain)`, so a language
card and a culture card can share similar text without conflicting with each other.

## Choosing basic vs cloze

Three different kinds of material need three different card shapes. Getting this wrong is exactly
what produces cards the user can't figure out how to answer — a cloze with more than one
plausible completion, or a chunk chopped into a fill-in-the-blank, both feel like guessing rather
than recall.

- **Grammar structures → `cloze`**, but only when the blank tests **one single point** and has
  **exactly one correct answer given the sentence alone** (verb tense/mood, a preposition, word
  order, an agreement). Use `{{c1::...}}` around the part being tested, e.g.
  `text: "If I {{c1::had known}}, I would have called you."`. Before creating it, check: *would
  this sentence, read in isolation with the blank, uniquely determine the right answer?* If two
  answers would both fit, or you're testing more than one thing at once (tense **and**
  preposition **and** agreement all in the same blank), either narrow the blank to one point, add
  disambiguating words elsewhere in the sentence, or fall back to `basic` with an explicit
  instruction as the front (e.g. front: `"Subjonctif présent de 'aller', 1ère pers. sing. : 'Il
  faut que j'___ à Paris.'"`, back: `"aille"`) so the user knows exactly what's being tested
  instead of guessing at the rule.

- **Chunks / formulaic expressions (collocations, fixed phrases, phrasal verbs used as a unit)
  → `basic`, not `cloze`.** Decomposing a chunk into a blank breaks the thing that makes it worth
  learning as a chunk — you're supposed to retrieve the whole unit from memory, not recognize a
  missing piece inside a sentence you can already read. Put a **description or a scenario** as
  `front` (in French, or in the target language if that doesn't give the answer away) and the
  exact chunk as `back` — this forces active recall of the whole expression, not just filling a
  gap. Example: front: `"Dire à quelqu'un de laisser tomber, familier"`, back: `"drop it"`, not a
  cloze of a sentence containing "drop it".

- **Raw vocabulary (single word/expression, no useful surrounding structure) → `basic`**, as
  before: `front`/`back`, straightforward translation or definition.

Always fill in `context` with the sentence from the session where the item came from — this is
the pedagogical traceability the whole system is built around; don't leave it empty for
convenience. For chunk cards where `front` is a description rather than the original sentence,
put the original sentence in `context` anyway so the traceability still holds.

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
  "domain": "language | culture, defaults to language if omitted",
  "context": "string, the originating sentence — always fill this in",
  "source_session": "string, format as '{language}-{ISO date}-{short label}', e.g. 'en-2026-07-11-history-review' — embedding the date lets you cross-reference cards against your history/en, history/es logs later without a manual lookup",
  "tags": ["chunk", "phrasal-verb", "subjonctif", "faux-ami", "culture", "..."]
}
```

Returns `201` with the created card, or **`409 Conflict`** if a card with the same (normalized)
`front`/`text` already exists in that `language`, or if it's textually too similar to an existing
card (fuzzy match, e.g. the same phrase reworded). Treat 409 as success, not an error — it means
the item is already tracked. Don't retry, don't ask the user, just skip it silently or note it
internally.

### `create_flashcards_batch`
`POST {API_BASE_URL}/cards/batch`
Same auth. Body: `{"cards": [ ...same shape as above... ]}`. Use this at the end of a session to
create everything qualified in one call instead of one request per card. Always returns `200`
with the list of cards that were actually created — conflicting ones (exact or fuzzy dedup) are
silently omitted from that list, not reported individually. If you need to know what was skipped,
compare the length of what you sent vs. what came back, or check `list_recent_cards` afterwards.

### `list_recent_cards`
`GET {API_BASE_URL}/cards/recent?lang={en|es}&domain={language|culture}&limit=20`
Same auth. `domain` is optional (omit to get both). Returns the most recently created cards,
newest first. Use this to check for near-duplicates before creating, and to build the
end-of-session confirmation message.

### `get_due_cards`
`GET {API_BASE_URL}/cards/due?lang={en|es}&domain={language|culture}&limit=20`
Same auth. `domain` is optional (omit to get both). Returns cards currently due for review,
soonest-due first. Use at the start of a session to see the real SRS state before deciding
whether to also schedule a manual retest in your own tracking (see "Avoid double-tracking" above).

### `get_card`
`GET {API_BASE_URL}/cards/{id}`
Same auth. Returns a single card's full state, including `reps`, `lapses`, `stability`,
`difficulty`, `due`, `last_review`. Use to check whether a specific item is already solid in the
app before deciding it needs remediation.

### `delete_flashcard`
`DELETE {API_BASE_URL}/cards/{id}`
Same auth. Deletes a card immediately — there's no undo, no soft-delete. Returns `204` on success,
`404` if the id doesn't exist (treat that as already-deleted, not an error).

Use this when:
- The user **explicitly asks** to remove a specific card.
- You just created a card in this same session and realize it's clearly wrong (bad language tag,
  malformed cloze, garbled content) — fix it by deleting and recreating, not by asking the user to
  do it themselves in the PWA.

Unlike creation, **don't delete silently**: always tell the user what was removed and why. This is
destructive and user-facing, not a quality-gate mechanic like the 409 dedup skip.

## End of session

If any cards were created, tell the user briefly: `"Cartes ajoutées : {n}"` followed by a short
list (front/back or cloze text per card). If nothing qualified, say nothing — don't report a
null result every session.
