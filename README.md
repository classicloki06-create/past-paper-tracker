# Past Paper Tracker

A static student-focused tracker for Cambridge International past papers. It uses plain HTML, CSS, vanilla JavaScript, Firebase Authentication, Cloud Firestore, and Chart.js.

## Project Structure

```text
index.html
login.html
signup.html
dashboard.html
papers.html
css/styles.css
js/firebase.js
js/firebase-config.js
js/firebase-config.example.js
js/auth.js
js/papers.js
js/dashboard.js
js/app.js
data/catalogue.json
data/cie/chemistry/9701/as.json
firestore.rules
firebase.json
```

## Firebase Setup

1. Create a Firebase project.
2. Enable Email/Password sign-in in Firebase Authentication.
3. Create a Cloud Firestore database.
4. Copy `js/firebase-config.example.js` to `js/firebase-config.js`.
5. Paste your Firebase web app configuration into `js/firebase-config.js`.

Firebase web app configuration values are not service-account secrets. Do not add private service-account keys to this static website.

## Firestore Rules

Deploy the included `firestore.rules` file. The rules only allow authenticated users to access:

```text
users/{uid}/attempts/{attemptId}
```

where `request.auth.uid == uid`.

## Data Model

The static catalogue is loaded from JSON files and is never stored in Firestore. Firestore stores only user attempts:

```json
{
  "paperId": "9701_2025_mj_11",
  "score": 34,
  "maximumMark": 40,
  "percentage": 85,
  "completedAt": "...",
  "attemptNumber": 1
}
```

Each saved attempt creates a new document in `users/{uid}/attempts`, so multiple attempts are preserved.

## Adding More Papers

Add or edit JSON catalogue files, then register each catalogue file in `data/catalogue.json`.

Example:

```json
{
  "board": "CIE",
  "subject": "Biology",
  "code": "9700",
  "qualification": "AS",
  "path": "data/cie/biology/9700/as.json"
}
```

The browser and dashboard load catalogue entries dynamically. No JavaScript changes are needed for new subjects, levels, years, sessions, variants, or papers.

## Local Use

Because the app uses JavaScript modules and `fetch()`, run it through a local static server rather than opening the HTML files directly from the file system.

One simple option:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deployment

Deploy the folder as a static website with Firebase Hosting, Netlify, Cloudflare Pages, GitHub Pages, or any static host. Make sure `js/firebase-config.js`, `data/catalogue.json`, and all catalogue JSON files are included in the deployed output.
