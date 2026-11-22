# OneMoreDay (onemoreday.app)

> *You are not the only one.*

An anonymous, strictly gender-neutral, text-only peer support network connecting people carrying the exact same life burdens (depression, financial debt, relationship heartbreak, family conflict).

No hired counselors. No accounts or passwords. No photos or media. Just pure human solidarity.

---

## Core Pillars

1. **No Accounts Required:** Users enter with a single anonymous session handle. No passwords, emails, or phone numbers.
2. **Strictly Gender-Neutral:** Strips away demographics and pronouns to focus 100% on the burden and eliminate dating dynamics.
3. **100% Text-Only:** Eliminates 100% of NSFW/graphic abuse and maintains pure conversational focus.
4. **24/7 Campfire Circles:** Small group support rooms capped at 10 peers to preserve intimacy.
5. **Private 1-on-1 Encounters:** Mutual-consent private DMs. Zero unsolicited messages.
6. **Stateless Anti-IDOR Security:** Cryptographic session tokens, unguessable room UUIDs, and ephemeral in-memory message routing. Zero database logging.
7. **Global Helpline Directory:** Immediate, tap-to-dial access to free, 24/7 crisis lines across 40+ countries.

---

## Project Structure

```
onemoreday/
├── api/
│   ├── session.js          # Stateless JWT session minter
│   └── pusher-auth.js      # Anti-IDOR channel authorization guard
├── public/
│   ├── index.html          # Landing page with hero & rules
│   ├── circles.html        # 24/7 Campfire Circles + live chat + mutual 1-on-1 invite
│   ├── dm.html             # Private 1-on-1 encrypted room with Leave & Wipe
│   ├── helplines.html      # 40+ Country Helpline Directory (auto-detects user region)
│   ├── css/style.css       # Sharp Midnight Modern theme (0 border-radius)
│   ├── js/app.js           # Nickname generator, content/contact sanitizers, crisis detector
│   └── illustrations/      # Custom abstract editorial figures
├── package.json            # Vercel serverless dependencies
├── vercel.json             # Deployment routing & security headers
└── .env.example            # Environment variables template
```

---

## Deployment to Vercel (100% Free)

1. Fork or push this repository to your GitHub.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Select your GitHub repository.
4. Add the environment variables from `.env.example`:
   * `SESSION_SECRET`: A long random string.
   * `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`: From your free [Pusher](https://pusher.com) sandbox.
5. Click **Deploy**.
