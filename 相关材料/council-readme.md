# Council

> Your thinking, round-tabled.
>
> Not an AI agent that grows with you. A council of minds — including your own — that you convene when decisions matter.

**Author**: 墨宇 (Siyu Deng) · **Status**: EvoTavern Beijing · In Development
**Stack**: CLI · SKILL.md · MCP Protocol · Claude API

---

## The question this project answers

Every product in this space is trying to make AI more like you.

**Hermes Agent** grows with you. **Second Me** trains a digital twin of you. **Evolver** runs a genetic protocol so its agent evolves toward your patterns. **花叔 nuwa-skill** distills thinkers into SKILL.md so you can summon them into Claude.

They are all asking the same question: *how do we make AI more personal?*

Council asks a different question:

**How do we make the human's thinking more structured, more callable, more debatable — so that the human stays the decision-maker, and AI is just the substrate that keeps the council in session?**

This is not a better agent. It is not an agent at all.

It is a new *subject-position* for the product.

---

## What Council actually is

A CLI (+ MCP server) that treats your thinking as a first-class asset.

Every time you have a high-signal conversation with an AI — the moment you reframe a problem, recognize a first-principles structure, reject the default answer, commit to a decision — Council **captures** it, **distills** it into a persona-shaped skill, and adds it to your round table.

When you face your next hard decision, you don't ask one AI. You **convene** your council:

- Your own distilled thinking patterns sit at the table
- The mentors you've distilled from others (Naval, Jobs, Munger) sit at the table
- Scenario roles you've defined (devil's advocate, future self, first customer) sit at the table

They deliberate. They disagree. They cross-examine. You preside, you synthesize, you decide.

Then that deliberation itself becomes a new asset.

---

## Why the subject matters

Consider the product metaphors, side by side:

| | Subject | User role | Metaphor |
|---|---|---|---|
| **Evolver** | an AI agent | trainer, operator | "I'm raising a digital creature that evolves" |
| **Hermes** | an AI agent | served party | "I have an AI secretary that grows with me" |
| **Second Me** | your AI twin | trainer + user | "I have a private AI version of myself" |
| **Council** | **your thinking** | **chair of the council** | **"I'm presiding over my own thought round-table"** |

Hermes and Evolver win when the AI gets smarter.
Council wins when **you** get clearer.

This is not a feature difference. It is a worldview difference — and it determines every downstream product decision: the UX, the data model, the pricing, what "more" means. Competitors can copy features. They cannot copy a worldview without becoming a different product.

---

## The gap these other products leave

After studying the four leading projects in this space, three structural gaps stand out. Council is built to fit exactly into these gaps.

**Gap 1 · Everyone stores facts and preferences. No one stores reasoning paths.**

Hermes remembers that you like concise answers. Second Me models your communication style. Memory systems everywhere capture *what* you said. None of them capture *how you arrived at the decision* — the reframing move, the principle you applied, the objection you raised against the AI itself.

Council's `capture` command identifies these "thinking highlights" specifically: reframes, rejections, first-principles moves, commitment points. Not what you know. How you think.

**Gap 2 · Every persona is a soloist. No one stages the debate.**

花叔's ecosystem gives you a library of thinkers. But when you summon `naval.skill`, you get Naval alone. When you summon `jobs.skill`, you get Jobs alone. The hard part of real decisions — getting different mental models to actually argue with each other — is left to the user to simulate mentally.

Council's `convene` command stages the debate as a product primitive. Three personas speak, then cross-examine each other's blind spots, then synthesize — with disagreements explicitly surfaced, not smoothed over.

**Gap 3 · Evolution is agent-side. The human's growth has no infrastructure.**

Evolver evolves the agent. Hermes improves the agent. No one is building a system where **your own thinking** becomes more coherent, more consistent, more auditable over time. Your thinking is treated as input to AI, not as output to be refined.

Council inverts this. Your thinking is the product. The AI is the infrastructure.

---

## Architecture at a glance

```
~/.council/                      ← your round table, as a directory
├── identity.md                  ← who you are, what you're working on
├── personas/
│   ├── self/                    ← distilled from your own conversations
│   ├── mentors/                 ← distilled from others (compatible with nuwa-skill)
│   └── roles/                   ← scenario personas (devil's advocate, future self)
├── sessions/                    ← raw captured conversations
├── skills/                      ← distilled thinking skills
├── transcripts/                 ← records of past councils
└── exports/                     ← MCP server, Claude Skills, Cursor rules
```

Four core verbs:

```bash
council capture    # pull in a conversation, find the thinking highlights
council distill    # turn highlights into persona-shaped skills
council convene    # stage a debate among selected personas
council evolve     # let use-feedback refine old skills; retire stale ones
```

Plus the export that makes Council portable:

```bash
council export --mcp     # become a Model Context Protocol server
council export --claude  # export as Claude Skills
council export --cursor  # export as Cursor rules
```

Once exported as MCP, any Claude Desktop / Cursor / Codex conversation can call your council directly. You don't move between tools — your council travels with you.

---

## What Council intentionally is *not*

To keep the product sharp, some doors are closed on purpose.

**Not a digital twin.** Council doesn't try to speak for you. It stages voices — including yours — and you still make the call.

**Not an autonomous agent.** Council doesn't act in the world. It clarifies thinking. When a council session ends, you go do the thing.

**Not a memory system.** Council doesn't try to remember everything. It captures the moments that earned the right to be remembered — decisions, reframes, commitments — and leaves the rest in the transcript.

**Not a replacement for Hermes / Evolver / Second Me.** These tools make AI better at being you. Council makes *you* better at being you. Both are valuable. Council is explicit about which one it is.

---

## Ecosystem stance

Council's design principle is **integrator, not competitor**.

- Every `nuwa-skill` SKILL.md can be imported as a mentor persona — no conversion needed
- Second Me models can be loaded as a "self persona" slot
- Hermes / Evolver distilled skills can sit in the personas directory as capability modules
- Council exports to MCP, Claude Skills, and Cursor rules so every downstream tool benefits

This is not a defensive choice. It is a strategic one. Council is most valuable when it makes every existing project more useful, not when it fights them for the same user.

---

## Hackathon MVP

Two days. One linear demo that must work end-to-end.

**Must ship:**
- `council init`, `capture`, `distill`, `convene`, `export --mcp`
- Three pre-loaded mentor personas (Naval, Jobs, Munger) imported from nuwa-skill
- Three self personas distilled in advance from real author conversations
- A terminal rendering that makes the debate visible — not a JSON dump

**Explicitly deferred:**
- Web UI, auth, multi-user, vector search, fine-tuning, Council-to-Council network

**Success metric for the demo:** a judge who has never seen the product should, within 90 seconds, understand that this is fundamentally a different kind of product from Hermes.

---

## Philosophy

Four principles, kept short on purpose.

1. **Your data stays yours.** `~/.council/` is plain Markdown. Git-trackable, auditable, exportable, deletable. No database, no cloud dependency.
2. **Protocols over products.** Council speaks SKILL.md, MCP, and AGENTS.md. Anything that speaks these protocols becomes an extension of Council for free.
3. **Disagreement is a feature.** A council that always agrees is a council you don't need. Council surfaces dissent rather than smoothing it.
4. **Discipline of subtraction.** No web UI. No training. No database. CLI + Markdown + MCP. Ten years from now the interface should still make sense.

---

*Welcome to the real world. Convene your council.*
