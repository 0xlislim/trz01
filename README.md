# trz01

Automated bus booking for Zone01 Oujda transport (`transport.zone01oujda.ma`).

It logs in with your Zone01 credentials, watches for your chosen bus times as
they are released, and books a seat automatically (solving the reCAPTCHA
audio challenge and confirming the booking in a Chrome window).

## Requirements (fresh machine)

- **Node.js 20+** and **npm** (Debian/Ubuntu: `sudo apt install nodejs npm`)
- **Google Chrome** or **Chromium** (must launch as your user, no sudo needed):
  - Chrome: `sudo apt install google-chrome-stable`
  - Chromium: `sudo apt install chromium`
- A running **desktop session** — booking opens a real Chrome window on your
  display, so the machine must be logged in at booking time.
- Network access to `transport.zone01oujda.ma`, `google.com` (reCAPTCHA) and
  `huggingface.co` (speech model download on first run).

> **Timezone note:** the site runs in **UTC+1**. All slot times you enter are
> local (UTC+1) times; they are converted to UTC internally.

## First-time setup

```bash
git clone git@github.com:0xlislim/trz01.git
cd trz01
./setup.sh          # installs npm deps, creates .env, tells you next steps
```

Then run the menu and configure it:

```bash
trz01               # or: ./trz01
```

Menu flow:

1. **`1) Set credentials`** — enter your Zone01 username + password once.
   The session token is saved to `.env` (never the password). Re-run this
   whenever the token expires.
2. **`2) Morning slot`** / **`3) Evening slot`** — enter the bus time
   (`HH:MM`), departure and destination, and the booking release time
   (defaults: morning `16:00`, evening `12:00`).
3. **`10) Wait-for-seat on/off`** — optional. If your chosen time is already
   full, keep polling that time until a seat frees up (set how many minutes
   to keep waiting), then book.
4. **`4) Show current config`** or **`9) Check config`** — verify everything
   is set up before booking.

## Running it

- **Scheduled (recommended):** cron fires ~1 minute before each slot release
  and books when the bus appears.
  ```bash
  ./install-cron.sh   # adds 15:59 (morning) and 11:59 (evening) jobs
  ```
  Logs: `logs/cron.log`. Remove with `crontab -e` (delete the two `trz01`
  lines) or `crontab -r`.

- **Foreground scheduler:** menu option `5` runs `main.js`, which keeps
  running and books each slot at its configured release time. Requires the
  terminal to stay open.

- **As a background service (optional):**
  ```bash
  ./install-service.sh
  ```
  Runs without keeping a terminal open. Note: cron and the service both
  schedule bookings — **use one or the other**, not both. For the service to
  run at boot without a login you need `sudo loginctl enable-linger $USER`
  (requires admin once).

- **Rebook:** menu option `7`, format `OLD->NEW` (e.g. `18:15->09:00`).
  Cancels the old reservation via the API, then books the new time.
  Rebooking always cancels first, so your old seat is freed before the new
  one is booked.

- **My reservations / cancel:** menu option `8` lists your reservations and
  can cancel one (API only, no browser).

- **Stop the booking browser:** menu option `6` kills only the booking Chrome
  popup (tracked via its own PID + unique profile marker); your normal
  Chrome is never touched.

## Configuration

`config.json`:

```json
{
  "chromiumBinary": "/usr/bin/google-chrome",
  "slots": [
    {
      "type": "morning",
      "run_at": "16:00:00",
      "traject": "09:00",
      "from": "Doha",
      "to": "Campus",
      "waitForSeat": false,
      "waitForSeatTimeout": 60
    },
    {
      "type": "evening",
      "run_at": "12:00:00",
      "traject": "17:30",
      "from": "Campus",
      "to": "Bab El Gharbi",
      "waitForSeat": false,
      "waitForSeatTimeout": 60
    }
  ],
  "test_slot": ""
}
```

- `run_at` — when the booking opens (local time). The bus list is released at
  these times.
- `traject` — the bus time you want to book.
- `from` / `to` — departure / destination.
- `waitForSeat` / `waitForSeatTimeout` — keep polling a full time until a
  seat frees (minutes cap). Toggle via menu option `10`.
- `test_slot` — set to a time (e.g. `"09:00"`) to book immediately on
  `npm start` (for testing).

`.env`:

```
TOKEN=<session token>
```

The token is set automatically by menu option `1`; re-run it if bookings stop
working (token expires).

## How booking works

1. Polls `GET /api/buses` until the target bus appears (at release time).
2. Opens the dashboard in a real Chrome window (unique profile in
   `/tmp/trz01-profile`), clicks your bus's **Book** button.
3. Solves the reCAPTCHA: checks the box (or clicks the audio challenge and
   transcribes it with a local Whisper model).
4. Clicks **Confirm** and waits for the booking response.

On captcha failures (automation detected) the page reloads and retries
(3 attempts). The popup auto-closes on success, after 5 failed captcha tries,
or after the task timeout.

## Files

| Path | Purpose |
| --- | --- |
| `main.js` | Entry point / scheduler (`npm start`). |
| `trz01` | Interactive menu. |
| `setup.js` | Credentials, slots, wait-for-seat, checks, reservations. |
| `rebook.js` | Cancel old time -> book new time. |
| `utils/booking-runner.js` | Polling, Chrome automation, booking flow. |
| `reCaptchaSovler/solver.js` | reCAPTCHA solving. |
| `utils/reservations.js` | Reservation list / cancel via API. |
| `install-cron.sh` / `install-service.sh` | Scheduler installers. |
| `kill-booking.sh` | Kill only the booking Chrome popup. |