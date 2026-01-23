# YouTube Outlier Finder
## Momentum vs Proven Formats — Product Decision & Implementation Plan

**Status:** Approved direction  
**Purpose:** Resolve trust issues caused by old videos appearing as "breaking out now" and define a clear product structure that aligns with user expectations.

---

## 1. Problem Statement

YouTube Outlier Finder currently identifies videos that significantly outperform their channel size ("outliers").

However, the product promise and UI language emphasize immediacy ("breaking out now"), while the algorithm sometimes surfaces older videos that performed exceptionally well in the past or are evergreen.

**This creates a perception gap:**

- Users expect fresh, timely opportunities
- They sometimes see older videos
- They conclude the tool is broken or misleading
- Trust is lost, even when the data is valid

**This is not a data problem — it is a product framing and intent separation problem.**

---

## 2. Core Insight

The app is currently serving two different user intents in a single view:

| Intent | User Question | Time Sensitivity |
|--------|--------------|------------------|
| **Momentum Discovery** | "What should I make right now?" | High |
| **Format Validation** | "What formats are proven to work?" | Low |

**When these intents are mixed:**

- Old videos feel wrong
- Few results feel broken
- Users don't know how to interpret what they're seeing

---

## 3. Strategic Decision (Final)

✅ **Enforce Freshness & Momentum by default**  
✅ **Make Proven Formats an explicit secondary mode**  
✅ **Separate the two experiences clearly in UI, copy, and logic**

This preserves the value of both use cases without confusing users.

---

## 4. New Product Structure

### 🔥 Mode 1: Breaking Now (Default)

**Purpose:**  
Help creators spot current opportunities they can act on immediately.

**Default behavior:**

- Hard filter to recent videos (last 30–60 days)
- OR videos showing strong current velocity (views/day)
- Sorted primarily by velocity, secondarily by multiplier

**Language used:**

- "Breaking now"
- "Accelerating"
- "Gaining traction"
- "Opportunity window"

**User expectation:**

- Few results = good (low competition)
- Old videos should not appear here unless clearly accelerating

**Empty state (important):**

> "No fresh breakouts in this niche right now.  
> That's a good sign — it means low competition.  
> Switch to Study Vault to explore proven formats."

---

### 📚 Mode 2: Study Vault (Secondary)

**Purpose:**  
Help creators learn what formats, titles, and angles have proven to outperform.

**Behavior:**

- Includes videos from the last 6–12 months (or all time)
- Sorted by highest multiplier
- Higher minimum views (to filter flukes)

**Language used:**

- "Proven formats"
- "Validated"
- "Study this"
- "Pattern analysis"

**User expectation:**

- Many results = good (lots to learn from)
- Older videos are expected and valuable

---

## 5. Visual & Copy Separation (Non-Negotiable)

**Tabs / Toggle (top of results)**

```
[ 🔥 Breaking Now ]   [ 📚 Study Vault ]
```

**Each mode must have:**

- Different helper text
- Different empty states
- Different explanatory language
- A video should never feel "out of place."

---

## 6. Handling Edge Cases (Trust Preservers)

### "Zombie" / Resurrected Videos

Sometimes older videos genuinely start accelerating again.

**Rule:**

- Allow these in Breaking Now
- Clearly label them

**Visual cue:**

- **Badge:** "Resurrected"
- **Copy:** "Published 8 months ago — gaining momentum again"

This reframes confusion into insight.

---

## 7. What We Are NOT Doing (For Launch)

To maintain focus and avoid scope creep, the following are explicitly deferred:

❌ Adaptive thresholds by niche  
❌ AI explanations / pattern breakdowns  
❌ Trend lineage tracking  
❌ Historical analytics dashboards  
❌ Multi-platform expansion

These are future enhancements, not launch blockers.

---

## 8. Success Criteria

This change is successful if:

- ✅ Users stop questioning old videos
- ✅ Sparse results feel intentional
- ✅ Users clearly understand what mode they're in
- ✅ Trust in the results increases
- ✅ The product feels sharper and more purposeful

---

## 9. Implementation Phases (High-Level)

### Phase 1 — Structural Fix (Immediate)

- Add mode toggle (Breaking Now / Study Vault)
- Enforce freshness rules in Breaking Now
- Adjust copy and empty states

### Phase 2 — Clarity Enhancements

- Show publish age + velocity context
- Add "why this is here" microcopy

### Phase 3 — Differentiation

- Pattern revival insights
- Momentum alerts
- Trend tracking (database-backed)

---

## 10. Final Product Positioning (One Sentence)

> **YouTube Outlier Finder helps creators spot what's gaining momentum right now — and study proven formats that consistently outperform — without confusing the two.**

---

## Implementation Notes

### Technical Considerations

**Breaking Now Mode:**
- Filter by `publishedAt` date (last 30-60 days)
- OR filter by `viewsPerDay` velocity threshold
- Sort by velocity first, then multiplier
- Update `isOutlierVideo()` to accept mode parameter

**Study Vault Mode:**
- Filter by date range (6-12 months or all time)
- Higher minimum views threshold
- Sort by multiplier only
- Different outlier threshold (may be higher)

**UI Components:**
- Mode toggle component (tabs or segmented control)
- Mode-specific empty states
- Mode-specific helper text
- Video card badges for "Resurrected" videos

**API Changes:**
- Add `mode` query parameter to `/api/search`
- Pass mode to outlier detection logic
- Return mode-specific metadata

### Copy Updates Required

**Breaking Now:**
- Hero: "Spot what's breaking out right now"
- Helper: "Videos gaining momentum in the last 30-60 days"
- Empty: "No fresh breakouts — low competition opportunity"
- Badge: "Accelerating" / "Resurrected"

**Study Vault:**
- Hero: "Study proven formats that outperform"
- Helper: "Validated formats from the past 6-12 months"
- Empty: "No proven formats found — try a different niche"
- Badge: "Proven" / "Validated"

---

**Last Updated:** January 2025  
**Status:** Approved for implementation  
**Priority:** High (trust and clarity issue)
