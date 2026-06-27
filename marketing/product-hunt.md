# Product Hunt Launch Copy

## Product Name
**3 AI Discussion**

## Tagline (60 chars max)
> 3 frontier AIs debate, then a neutral AI judges & stress-tests it.

代替候補:
- `Claude, ChatGPT & Gemini debate — then judge & stress-test it`
- `Not just a summary. A verdict, stress-tested by a counter-AI`
- `3 AIs debate your decision, judged with confidence — ¥980/mo`

## Topics / Tags
`Artificial Intelligence` · `Productivity` · `Open Source` · `Decision Making` · `Chatbots`

## Cover image
`public/og.png` (1200×630)

---

## Description (260 chars max for the gallery card)

> Stop asking just one AI. **3 AI Discussion** lets Claude Opus 4.8, GPT-5.5, and Gemini 3.5 Flash debate the same topic in parallel — then a neutral AI **judges it with a confidence level** and **stress-tests the verdict against the strongest counter-argument**. One click re-judges if it breaks. ¥980/month, no API keys. Open-source.

---

## First comment (from maker)

Hey Product Hunt 👋

I'm @hideosugimoto, an indie developer from Tokyo.

**The problem I had:**
Whenever I had a hard decision — should I quit my job? should I bootstrap or raise? — asking ChatGPT alone always gave me a wishy-washy "both have pros and cons" answer. Asking Claude separately, then GPT, then Gemini, then comparing manually was exhausting.

**What I built:**
A web app where the same question gets sent to **all three frontier models in parallel**, they read each other's responses, and debate over multiple rounds. Then it goes further than a summary: a neutral AI **judges** the debate (with a confidence level and a per-conflict ruling), **stress-tests** that verdict against the strongest counter-argument, and lets you **re-judge in one click** if the conclusion breaks. You're the moderator — you can interject any round, and one-click deep-dive any unresolved point. Action plan included.

**Why ¥980/month (~$6.50):**
Subscribing to Claude Pro + ChatGPT Plus + Gemini Advanced separately would cost ~$60/month. Most people don't need three full subscriptions. We share API costs across the user base and pass on the savings. **No API keys to manage.**

**Tech stack** (for the curious):
- Cloudflare Pages Functions (edge runtime)
- D1 (SQLite) + KV
- Stripe subscriptions + one-time payments
- Google OAuth + JWT
- React 18 + Vite
- Verdict → stress-test → re-judge loop
- Dynamic per-discussion OG image (workers-og)
- 5-layer defense in depth + SRI
- **Source-available** under BSL 1.1 → MIT in 2030

**7 discussion modes:**
1. Standard — balanced
2. Debate — adversarial
3. Brainstorm — Yes-and divergent
4. Fact-check — evidence-first
5. Consensus — meet in the middle / third option
6. Decision — weigh options, recommend
7. Neutral summary — synthesis only (no verdict)

**What's free vs paid:**
- Free: bring your own API keys
- Premium (¥980): no API keys, cloud history, share links
- Plus (¥1,980): 2x usage cap

I'd love to hear what kinds of decisions you'd want 3 AIs to debate. Roast it, break it, ask anything.

---

## Maker Stories / Demo flow (gallery sequence)

1. **Hero shot** — `public/og.png`: "1つの問いに、3つの最強AI"
2. **The 3-column discussion view** — Claude / ChatGPT / Gemini side-by-side responses
3. **The "current standing" card** — agreements, conflicts, unresolved + each AI's stance, pinned
4. **The verdict + stress-test** — neutral AI's ruling with confidence, then the counter-AI's strongest objection → one-click re-judge
5. **Mind map view** — visualized stance per AI per theme
6. **Pricing page** — ¥980 vs ¥9,000 comparison
7. **Trust & Safety** — open source, source-available, 5-layer defense

---

## Posting time
US Pacific Time **12:01 AM** Tuesday or Wednesday is the sweet spot
(your launch ranks against products that launch the same day, and TUE/WED tend to have less hype-driven competition than MON)

## Pre-launch tasks
- [ ] Set OG image to PNG (`public/og.png`)
- [ ] Create demo GIF or 60s Loom video
- [ ] Set up "Coming soon" page on Product Hunt 1 week before
- [ ] Notify 20-30 friends/Twitter followers in advance
- [ ] Prepare 3-5 alternate taglines for A/B testing
- [ ] Draft first 5 anticipated questions + answers
