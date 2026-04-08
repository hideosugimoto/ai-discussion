# Product Hunt Launch Copy

## Product Name
**3 AI Discussion**

## Tagline (60 chars max)
> 3 frontier AIs debate your question, then summarize for you.

代替候補:
- `Claude, ChatGPT & Gemini debate your question — for ¥980/mo`
- `One question, three frontier AIs, one synthesized answer`
- `Multi-Agent LLM Playground for everyone — ¥980/mo`

## Topics / Tags
`Artificial Intelligence` · `Productivity` · `Open Source` · `Decision Making` · `Chatbots`

## Cover image
`public/og.png` (1200×630)

---

## Description (260 chars max for the gallery card)

> Stop asking just one AI. **3 AI Discussion** lets Claude Opus 4.6, GPT-4o, and Gemini 2.5 Pro debate the same topic in parallel — then auto-summarizes the agreements, conflicts, and final conclusion. ¥980/month, no API keys required. Open-source.

---

## First comment (from maker)

Hey Product Hunt 👋

I'm @hideosugimoto, an indie developer from Tokyo.

**The problem I had:**
Whenever I had a hard decision — should I quit my job? should I bootstrap or raise? — asking ChatGPT alone always gave me a wishy-washy "both have pros and cons" answer. Asking Claude separately, then GPT, then Gemini, then comparing manually was exhausting.

**What I built:**
A web app where the same question gets sent to **all three frontier models in parallel**, they read each other's responses, and debate over multiple rounds. Then a summary AI extracts the agreements, conflicts, and unresolved points — and offers an action plan.

**Why ¥980/month (~$6.50):**
Subscribing to Claude Pro + ChatGPT Plus + Gemini Advanced separately would cost ~$60/month. Most people don't need three full subscriptions. We share API costs across the user base and pass on the savings. **No API keys to manage.**

**Tech stack** (for the curious):
- Cloudflare Pages Functions (edge runtime)
- D1 (SQLite) + KV
- Stripe subscriptions + one-time payments
- Google OAuth + JWT
- React 18 + Vite
- 5-layer defense in depth + SRI
- **Source-available** under BSL 1.1 → MIT in 2030

**5 discussion modes:**
1. Standard — balanced
2. Debate — adversarial
3. Brainstorm — Yes-and divergent
4. Fact-check — evidence-first
5. Conclusion — neutral synthesis

**What's free vs paid:**
- Free: bring your own API keys
- Premium (¥980): no API keys, cloud history, share links
- Plus (¥1,980): 2x usage cap

I'd love to hear what kinds of decisions you'd want 3 AIs to debate. Roast it, break it, ask anything.

---

## Maker Stories / Demo flow (gallery sequence)

1. **Hero shot** — `public/og.png`: "1つの問いに、3つの最強AI"
2. **The 3-column discussion view** — Claude / ChatGPT / Gemini side-by-side responses
3. **The auto-summary** — agreements, conflicts, unresolved
4. **Mind map view** — visualized stance per AI per theme
5. **Pricing page** — ¥980 vs ¥9,000 comparison
6. **Trust & Safety** — open source, source-available, 5-layer defense

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
