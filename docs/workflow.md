# Workflow

This document describes the behavior present in the exported n8n workflow. It does not add authentication or storage behavior that is not implemented.

## 1. Start Session

`POST /dqr-start` checks the submitted professor key. For an authorized request, it creates a session ID, stores the lecture name, creates the first random token, and marks the session active in workflow static data.

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

The workflow does not currently enforce a specific university email domain.

## 7. Check Duplicate

Google Sheets is queried for the submitted session ID and student ID. If a matching row exists, the workflow returns `DUPLICATE` and does not append another row.

## 8. Record Attendance

A new row is appended to the `Attendance` sheet with session ID, student ID, student name, email, timestamp, token, and `Present` status.

## 9. Send Confirmation

The Gmail node sends an HTML confirmation email using the submitted email address and lecture name. The attendance success response is produced before the email node, and the Gmail node is configured to continue on regular errors.

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
