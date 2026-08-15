# Credit Ledger

A simple phone-friendly ledger for tracking retailer credit across two books
(Santhoor and MTR). Built for one user (your dad) with large text, high
contrast, and a 4-digit PIN lock instead of accounts/login.

## How it works

- One shared retailer list. Each retailer has a separate running balance
  per book, calculated as (total purchases) − (total payments).
- "New Purchase" adds to what a retailer owes you. "Payment Received"
  subtracts from it. Every entry is timestamped and kept in that
  retailer's history — nothing is silently overwritten.
- Voice entry: no custom speech code needed. The amount field is a plain
  text box, so his phone's Gboard Kannada voice-typing mic works on it
  the same way it does in WhatsApp — tap the mic, speak the number, it
  fills in as digits.

## Running locally

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 — PIN defaults to `1234` (set `LEDGER_PIN` env
var to change it). Data is stored in a local `ledger.db` SQLite file.

## Deploying (Render + a free persistent Postgres)

Render's free web services have **ephemeral disks** — anything in SQLite
gets wiped on redeploy or restart. For real financial data, use a small
free persistent Postgres from **Neon** (neon.tech) or **Supabase**
instead, and point this app at it. Steps:

1. **Create a free Postgres database** on neon.tech (or supabase.com).
   Copy the connection string it gives you (starts with `postgres://` or
   `postgresql://`).

2. **Push this folder to a GitHub repo** (same as you did for CrimeBot).

3. **On Render**: New → Web Service → connect the repo.
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
   - Add environment variables:
     - `DATABASE_URL` = the Postgres connection string from step 1
     - `SECRET_KEY` = any long random string
     - `LEDGER_PIN` = a 4-digit PIN your dad will remember (not `1234`)

4. Deploy. Render gives you a URL like `ledger-yourname.onrender.com` —
   bookmark that on his phone (Add to Home Screen so it opens like an app).

Note: Render's free tier spins down after inactivity, so the first open
each day may take ~20–30 seconds to wake up. That's normal on free
hosting — mention it to him so he isn't confused by the delay.

## Adding your existing retailers

Since the paper chits aren't digitized yet, do a one-time setup pass:
open the app → pick a book → **Add Retailer** → enter name and current
outstanding balance as the "opening balance". Repeat for each retailer.
Because retailers are shared across both books, you only enter the name
once — just add the correct opening balance in each book separately if
they owe on both.

## Project structure

```
app.py            Flask app + API routes + PIN auth
models.py         SQLAlchemy models (Retailer, Transaction)
requirements.txt
Procfile           Render start command
static/
  index.html
  style.css
  app.js          All frontend logic, vanilla JS (no build step)
```
