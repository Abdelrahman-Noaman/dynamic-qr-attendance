# Workflow

This document describes the behavior present in the exported n8n workflow. It does not add authentication or storage behavior that is not implemented.

## 1. Start Session

`POST /dqr-start` checks the submitted professor key. For an authorized request, it creates a session ID, stores the lecture name, creates the first random token, and marks the session active in workflow static data.

An authorized start also creates **a new spreadsheet for that session**:

```text
Create Session      validates the key and the lecture location, then plans the
                    workbook: title "Attendance - <Lecture> - <Session ID>",
                    tab "Attendance", and the 17 Attendance headers
Start OK?           a rejected start is answered immediately - no spreadsheet
Create Attendance Workbook
                    Google Sheets "Create spreadsheet" with a single
                    Attendance tab (Google omits the default Sheet1 when the
                    create call lists sheets)
Prepare Sheet Setup reads the create response and keeps the tab name Google
                    actually used (never an assumed "Attendance"), builds the
                    header-row item, and the batchUpdate body for bold +
                    frozen headers and a plain-text Student ID column
Header Row          one item keyed by the 17 Attendance columns
Write Attendance Headers
                    Google Sheets "Sheet Within Document → Append" in
                    auto-map mode: on an empty tab n8n writes the input keys
                    as the header row, and the empty values leave no data row
Format Attendance Sheet
                    POST /v4/spreadsheets/{id}:batchUpdate (cosmetic only)
Activate Session    stores the workbook on the live session, appends it to the
                    workbook history used by /dqr-export, and answers
```

The header row is written by the **same Google Sheets node** that writes
attendance rows, so it uses the credential and transport that are already
proven; only the cosmetic formatting and `/dqr-export` use plain HTTP Request
nodes with that same OAuth2 credential (`drive.file` + `spreadsheets` scopes),
so no extra credential is required.

`Activate Session` verifies the write by checking that the sheet node echoed
back an item carrying every Attendance column, and refuses the start when it
did not. Its `detail` carries the underlying Sheets error, the tab name and the
A1 range so a refused start says what actually happened.

The session is only live once the workbook exists **and** its header row was
written. Otherwise `Activate Session` deletes the half-started session and
answers `WORKBOOK_CREATE_FAILED` or `WORKBOOK_SETUP_FAILED`, because an
`append` into a sheet without headers would invent its own columns. Those nodes
are set to *continue (regular output)* so such failures are reported as a
refused start instead of a 500.

The request must also carry the professor-confirmed lecture-hall reference:

```text
instructorLatitude             WGS-84 latitude of the map pin
instructorLongitude            WGS-84 longitude of the map pin
instructorLocationSource       "map" (default)
instructorLocationConfirmedAt  epoch ms of the "Confirm Lecture Location" press
```

For a `map` reference n8n validates the coordinate ranges and the confirmation
timestamp only — **no GPS accuracy is required or accepted for the reference** —
and rejects with `LECTURE_LOCATION_MISSING`, `LECTURE_LOCATION_INVALID`, or
`LECTURE_LOCATION_STALE` (confirmation older than 60 minutes). The stored
session then holds `location: { latitude, longitude, accuracy: null, source: "map",
confirmedAt }` and `locationQualityStatus: "CONFIRMED"`.

The legacy `instructorLocationSource: "gps"` path is still accepted for tools
that send a device reading; it keeps the original checks (coordinate range,
positive accuracy ≤ 50 m, capture age ≤ 30 s, `STALE_LOCATION` /
`LOW_ACCURACY`). The dashboard never uses it.

## 2. Generate Token

The start step generates a six-character token using an uppercase alphanumeric alphabet that excludes ambiguous characters.

## 3. Serve and Rotate QR

`GET /dqr-qr` checks the professor key and returns the active session, current token, lecture, and remaining lifetime. The token lifetime is 10 seconds. When the lifetime has elapsed, the old token is overwritten with a new token.

The response also carries `attendanceSheet` (`sessionId`, `tab`, `title`, `url`,
`xlsxUrl`) so the dashboard can show the workbook while the session is live. An
**inactive** session answers `active: false` together with the same
`attendanceSheet`, which is what keeps the download available after a refresh.

## 4. Validate Student Scan

`GET /dqr-check?s=<session>&t=<token>` verifies that a session is active, the session ID matches, the token is still within its 10-second window, and the token matches the current token. Failures return a reason such as `SESSION_CLOSED`, `WRONG_SESSION`, `TOKEN_EXPIRED`, or `TOKEN_INVALID`.

## 5. Generate Temporary Ticket

For a valid scan, n8n builds a payload containing session ID, token, and an expiry timestamp three minutes in the future. It signs that payload with HMAC-SHA256 and returns the payload plus signature as the ticket.

## 6. Validate Submission

`POST /dqr-submit` parses the ticket and form fields, recomputes the HMAC signature, checks ticket expiry, confirms that the same session is still active, checks that name and student ID are present, and applies a basic email format check.

The workflow also requires a browser-generated device ID. The student page creates
the ID once in `localStorage` and sends it with the submission. The `Attendance`
sheet must contain a `Device ID` column. Duplicate checking reads all rows for the
session and rejects either a repeated student ID or a repeated device ID.

The device ID is a persistent browser identifier, not a guaranteed hardware
fingerprint. Clearing browser storage, using private browsing, or changing
browsers can create a new ID, so it should be treated as an additional control
rather than a replacement for student identity verification.

The workflow does not currently enforce a specific university email domain.

The student page still uses real browser geolocation: high accuracy, no cached
fixes, up to three sequential readings inside a 30 s window, and the most
accurate fresh reading is submitted. If no reading meets the 50 m target the
page does not submit at all.

The workflow validates the student reading and decides once, with no review
state:

```text
accuracy > 50 m                    -> REJECTED / LOW_ACCURACY
age > 30 s                         -> REJECTED / STALE_LOCATION
bad coordinates / accuracy / clock -> REJECTED / INVALID_LOCATION
no reading                         -> REJECTED / LOCATION_UNAVAILABLE
Haversine(student, confirmed hall) > 100 m -> REJECTED / OUTSIDE_RADIUS
otherwise                          -> ACCEPTED / VERIFIED
```

`locationStatus` therefore only ever holds `VERIFIED`, `OUTSIDE_RADIUS`,
`LOW_ACCURACY`, `STALE_LOCATION`, `INVALID_LOCATION`,
`LOCATION_UNAVAILABLE`, or `LECTURE_LOCATION_*`. Accuracy and freshness
failures are never reported as `OUTSIDE_RADIUS`, and the radius is never
widened to compensate for a poor fix. Rejected submissions return
`{ ok: false, status: "REJECTED", reason, distanceMeters, accuracyMeters }`
to the student page and are not written to Sheets.

Session counters in workflow static data are `{ verified, outsideRadius,
rejected }`; `needsReview` no longer exists.

`ATTENDANCE_RADIUS_METERS` (100 m) controls instructor/student distance.
`MAX_GPS_ACCURACY_METERS` (50 m) controls uncertainty and is intentionally a
separate setting; it is never widened to compensate for a poor fix. The server
calculates the distance from the validated coordinates and never trusts a
browser-provided status or distance. The distance is rounded to two decimals
for the sheet.

## 7. Check Duplicate

Google Sheets is queried for the submitted session ID. If a matching row has
either the submitted student ID or device ID, the workflow returns `DUPLICATE`
and does not append another row.

The lookup targets the session's own workbook: `Validate Submission` publishes
`workbookId` from the session state, and the three sheet nodes
(`Check Duplicate`, `Save Attendance`, `Save Rejected Location`) all use it as
their document ID. When a session somehow has no workbook — only possible for a
session that was already running before the workbook step existed — they fall
back to the shared prototype sheet and `workbookIsFallback` is `true`.

## 8. Record Attendance

Only accepted submissions reach this node. A row is appended to the
`Attendance` tab **of that session's workbook** with the original fields plus
the instructor/student
coordinates, distance, both accuracy values, location status, location
timestamp, and review status. Column names and order are unchanged. The
coordinates written are the exact values used in the distance calculation, and
`Instructor Latitude/Longitude` are the confirmed lecture-hall pin.
`Instructor GPS Accuracy (m)` is empty for a map reference (there is no measured
accuracy to report). `Status` is `Present` for every row that is written, and
only `VERIFIED` rows continue to the email branch.

## 9. Send Confirmation

After verified attendance is saved, the `Use Outlook Email?` node routes the confirmation
by recipient domain. Addresses ending in `outlook.com`, `hotmail.com`, `live.com`, `msn.com`, or
`must.edu.eg` use the Microsoft Outlook node; all other addresses use Gmail. The attendance success response is produced before the email branch,
and both email nodes are configured to continue on regular errors.

Configure a Microsoft Outlook OAuth2 credential on `Send Outlook Confirmation`
before activating the workflow. The exported workflow contains a placeholder
credential ID for that node.

## 10. Stop Session

`POST /dqr-stop` checks the professor key, marks the session inactive, and clears its token. New scans fail, and existing tickets fail the active-session check during submission.

The response returns what the professor needs to close the lecture:

```json
{
  "ok": true,
  "sessionId": "S20261029-ABCD",
  "lecture": "Data Security",
  "locationStats": { "verified": 12, "outsideRadius": 1, "rejected": 2 },
  "attendanceSheet": {
    "sessionId": "S20261029-ABCD",
    "tab": "Attendance",
    "title": "Attendance - Data Security - S20261029-ABCD",
    "url": "https://docs.google.com/spreadsheets/d/<id>/edit",
    "xlsxUrl": "https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx"
  }
}
```

The workbook reference is **kept** on the stopped session (and in the workbook
history), so the sheet can still be opened and downloaded afterwards.

## 11. Download the Session Workbook

`GET /dqr-export?key=<professor key>[&s=<session id>]` streams that session's
workbook as `.xlsx`:

```text
Resolve Export   checks the key and resolves the workbook from the session or
                 from the workbook history (last 20 sessions); without `s` it
                 uses the current/last session
Export Ready?    unauthorised -> 401, unknown session -> 404
Export XLSX      GET https://www.googleapis.com/drive/v3/files/{id}/export
                 ?mimeType=application/vnd.openxmlformats-officedocument
                   .spreadsheetml.sheet
                 using the workflow's Google Sheets OAuth2 credential, returned
                 as binary data in the `data` field
Respond XLSX     Respond to Webhook -> binary (`data`)
```

Serving the file through the workflow means the download uses **n8n's** Google
credential rather than the professor's browser session, so it works even when
the two accounts differ. If the export call fails, its error output answers
with JSON (`EXPORT_FAILED`) and the dashboard falls back to Google's own
`export?format=xlsx` link.

## Endpoint Summary

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/dqr-start` | POST | Create the active session **and its own spreadsheet** |
| `/dqr-qr` | GET | Read or rotate the current QR token |
| `/dqr-stop` | POST | Close the active session and return its sheet |
| `/dqr-check` | GET | Validate a QR scan and issue a ticket |
| `/dqr-submit` | POST | Validate and record attendance |
| `/dqr-export` | GET | Stream the session workbook as `.xlsx` |
