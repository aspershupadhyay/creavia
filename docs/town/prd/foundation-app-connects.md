# PRD · The app connects by itself (Phase 0)

**Status:** part 1 built (2026-11-27): the service address built in, the shared sign-in screen in the app, your own
studio as the advanced way · **Plan:** [../phases/phase-0-foundation.md](../phases/phase-0-foundation.md), "The app
connects by itself"

## 1. Problem

The desktop app asks every person for "your studio's address" before they can sign in, because each studio was
someone's own deployment. Creavia is a service: a new creator downloads the app and should be asked only to sign in or
create an account, as with any app. Running your own studio stays possible, as an advanced choice.

## 2. Who

A creator who installs the app and has never heard of a studio address; a teammate invited by email; a self-hoster who
runs their own Creavia Cloud and points the app at it.

## 3. Goals and non-goals

- **Goals:** the service's address is built into the app; the app's sign-in screen is the same one the web uses
  (`cloud/creavia/Gate.tsx`: sign in, create an account, check your email, forgot password, access token), with what
  that studio offers (open sign-up, email links); the session stays in Rust; "Use your own studio" is one click away
  and keeps the address it was given.
- **Non-goals (now):** Google sign-in inside the app (part 2: the system browser and a one-time code handed back to
  the app); invite links opening the app (they open the web, where the invite is accepted, then you sign in here).

## 4. Stories and acceptance

1. **As a new creator, I open the app and sign in or create an account** without typing an address. Done when the
   sign-in screen with no address field talks to the built-in service, and a build made without one asks for an
   address instead (the self-hosted builds).
2. **As a self-hoster, I choose "Use your own studio",** enter its address, and get the same screen for that studio.
   The choice is remembered; "Use Creavia" goes back.
3. **As anyone, signing in never puts a session in the web view.** Rust posts to the studio's `/api/login`, keeps the
   cookie in the keychain, and gives the screen only the answer's message.
4. **As the owner,** the live VoiceBox can't be the built-in address or an own studio (refused, as today).

## 5. How it works

- `CREAVIA_SERVICE_URL` is read when the app is built (`option_env!`), from the repository variable of the same name in
  the release workflow. Checked like any address (https, not a protected host); a bad one counts as none.
- `GET /api/login` with no invite answers the ways in that studio offers: `{ google, mail, open }` (all visible on its
  sign-in page anyway). An older studio that answers 404 gets the plainest screen.
- `cloud_auth(url?, body)` (Rust) posts only the sign-in fields (`email`, `password`, `invite`, `signup`, `resend`,
  `reset`, `token`) to `<studio>/api/login`. Only a success that starts a session replaces the stored one (cookie,
  address, who); a refusal or "check your email" leaves the current connection as it was.
- The screen: `desktop/src/pages/Connect.tsx` renders `Gate` with a `send` that calls `cloud_auth`, and `onDone` that
  refreshes the connection and opens Home.

## 6. Edge cases

| Case | Answer |
| --- | --- |
| A build with no service address | The screen asks for a studio address first (today's behaviour) |
| Signed in to an own studio, then "Use Creavia" | Nothing changes until a sign-in succeeds there |
| A wrong password while signed in | The existing connection stays |
| Sign-up on a studio with open sign-up | "Check your email"; the link opens in the browser, then you sign in here |
| A session cookie the studio clears in the same answer | Not a session: nothing is stored |
| The web view sends extra fields to `cloud_auth` | Dropped before the request |
| The built-in or entered address is the live VoiceBox | Refused before any request (`net.rs` `PROTECTED_HOSTS`) |
