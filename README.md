# 1MoreDay (1moreday.vercel.app)

> *You are not the only one.*

An anonymous, strictly gender-neutral, text-only peer support sanctuary connecting people carrying life burdens (depression, financial stress, relationship heartbreak, family conflict).

No hired counselors. No accounts or passwords. No photos or media. Just pure human solidarity.

---

## The Sanctuary Principles

1. **No Accounts Required:** Users enter with an anonymous handle. No passwords, emails, or phone numbers.
2. **Strictly Gender-Neutral:** Strips away demographics and pronouns to focus 100% on the burden and eliminate dating dynamics.
3. **100% Text-Only:** Eliminates NSFW/graphic abuse and maintains pure conversational focus.
4. **24/7 Campfire Circles:** Small group support rooms capped at 10 peers to preserve intimacy.
5. **Random 1-on-1 Pairing:** Single-click matchmaking pairs you with the next anonymous peer waiting to talk. Zero choosing strangers.
6. **24-Hour Auto-Delete:** Messages automatically delete after 24 hours. Zero permanent archives.
7. **Crisis Intervention First:** Immediate Tele-MANAS (14416) crisis card for Indian users, plus 50+ country crisis directories.

---

## Supabase Database Setup

1. Create a free project on **[supabase.com](https://supabase.com)**.
2. In your Supabase project dashboard, open the **SQL Editor** (left sidebar).
3. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
4. In Supabase **Project Settings** &rarr; **API**, copy:
   * **Project URL**
   * **anon public key**

---

## Required Environment Variables (Vercel)

Add these in your Vercel Project Settings under **Settings** &rarr; **Environment Variables**:

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Your Supabase Project URL | `https://your-project.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase `anon` `public` key | `eyJhbGciOi...` |

*(Note: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also accepted).*

---

## Architecture

* **Frontend:** Zero-border-radius dark editorial interface (`#0A0D12`).
* **Database:** Supabase PostgreSQL with Row Level Security (RLS) and 24-hour expiration filter.
* **Realtime Layer:** Supabase Realtime (PostgreSQL Changes & Presence) for sub-50ms message delivery and true online presence counts.
* **Auth:** Anonymous Supabase authentication (`signInAnonymously`). Zero email, password, or demographic tracking.

---

## Notice

© 2026 1MoreDay. All rights reserved.  
This project and its assets are proprietary. Not authorized for reproduction, public redistribution, or commercial duplication.
