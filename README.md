# 1MoreDay (1moreday.vercel.app)

> *You are not the only one.*

An anonymous, strictly gender-neutral, text-only peer support sanctuary connecting people carrying the exact same life burdens (depression, financial debt, relationship heartbreak, family conflict).

No hired counselors. No accounts or passwords. No photos or media. Just pure human solidarity.

---

## The Sanctuary Principles

1. **No Accounts Required:** Users enter with a single anonymous session handle. No passwords, emails, or phone numbers.
2. **Strictly Gender-Neutral:** Strips away demographics and pronouns to focus 100% on the burden and eliminate dating dynamics.
3. **100% Text-Only:** Eliminates 100% of NSFW/graphic abuse and maintains pure conversational focus.
4. **24/7 Campfire Circles:** Peer support rooms capped at 30–50 peers to ensure everyone gets attention and support.
5. **Private 1-on-1 Encounters:** Mutual-consent private DMs. Zero unsolicited messages.
6. **Stateless Anti-IDOR Security:** Cryptographic session tokens, unguessable room UUIDs, and ephemeral in-memory message routing. Zero database logging.
7. **Global Helpline Directory:** Immediate, tap-to-dial access to free, 24/7 crisis lines across 50+ countries plus universal international resources.

---

## Architecture Overview

* **Frontend:** Clean, responsive, zero-border-radius dark editorial interface.
* **Backend:** Stateless serverless API endpoints with HMAC-SHA256 session minting.
* **Realtime Layer:** Ephemeral WebSocket broadcast channels with server-side authorization guards.
* **Data Storage:** Zero-database. No user messages, transcripts, or personal data are ever written to disk.

---

## Notice

© 2026 1MoreDay. All rights reserved.  
This project and its assets are proprietary. Not authorized for reproduction, public redistribution, or commercial duplication.
