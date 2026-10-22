# Workflow

This document describes the behavior present in the exported n8n workflow. It does not add authentication or storage behavior that is not implemented.

## 1. Start Session

`POST /dqr-start` checks the submitted professor key. For an authorized request, it creates a session ID, stores the lecture name, creates the first random token, and marks the session active in workflow static data.

The request must also contain one instructor location reading. The dashboard
collects up to three sequential fresh readings (`enableHighAccuracy: true`,
`maximumAge: 0`, 12 s per call, 30 s overall) and sends the most accurate one.
n8n validates the coordinate range, positive accuracy, a numeric capture
timestamp that is not in the future, and a capture time no older than 30
seconds, and rejects with `LOCATION_UNAVAILABLE`, `INVALID_LOCATION`, or
`STALE_LOCATION`. The quality policy is configurable in the server-side
`Create Session` Code node as `REVIEW` or `REJECT`; it is not trusted from the
browser. With `REVIEW` (the default), an instructor reading above the 50 m
quality target is stored as `NEEDS_REVIEW`; the session may start, but
submissions are then rejected as `INSTRUCTOR_LOW_ACCURACY` because the reference
is too imprecise to compare against. With `REJECT`, the session start fails with
`LOW_ACCURACY`.

## 2. Generate Token

The start step generates a six-character token using an uppercase alphanumeric alphabet that excludes ambiguous characters.

## 3. Serve and Rotate QR

`GET /dqr-qr` checks the professor key and returns the active session, current token, lecture, and remaining lifetime. The token lifetime is 10 seconds. When the lifetime has elapsed, the old token is overwritten with a new token.

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

The student page requests fresh readings only after `/dqr-check` succeeds, using
the same shared module and the same configuration as the dashboard. It stops as
soon as a reading meets the 50 m target, gives up after three readings or 30
seconds, and refuses to submit at all when no acceptable reading is obtained.
The workflow then validates both coordinate pairs, positive accuracy, and a
capture age at or below 30 seconds, and calculates the Haversine distance
against the instructor's session reference.

`Location Status` is a single technical classification: `VERIFIED`,
`OUTSIDE_RADIUS`, `LOW_ACCURACY`, `INSTRUCTOR_LOW_ACCURACY`, `STALE_LOCATION`,
`INVALID_LOCATION`, or `LOCATION_UNAVAILABLE`. Accuracy and freshness reasons
are never reported as `OUTSIDE_RADIUS`. The default `REVIEW` policy stores
genuine outside-radius attempts as `Needs Review`; low-accuracy attempts are
rejected so the submission can be retried with a better reading.

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

## 8. Record Attendance

A new row is appended to the `Attendance` sheet with the original fields plus
the instructor/student coordinates, distance, both accuracy values, location
status, location timestamp, and review status. Column names and order are
unchanged. The coordinates written are the exact values used in the distance
calculation. `Present` is retained only for verified rows; review attempts use
`Needs Review`. Only `VERIFIED` rows continue to the email branch.

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

## Endpoint Summary

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/dqr-start` | POST | Create the active session |
| `/dqr-qr` | GET | Read or rotate the current QR token |
| `/dqr-stop` | POST | Close the active session |
| `/dqr-check` | GET | Validate a QR scan and issue a ticket |
| `/dqr-submit` | POST | Validate and record attendance |
