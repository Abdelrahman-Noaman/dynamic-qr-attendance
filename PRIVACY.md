# Privacy Policy

**Dynamic QR Attendance** (the "App")
Last updated: October 30, 2026

## Overview

The App is a personal, non-commercial tool that lets an instructor record student attendance during a lecture using short-lived QR codes. It is built with n8n and Google Sheets and is operated by its developer, Abdelrahman Noaman, for use in his own courses.

## What the App accesses in your Google account

The App connects to the developer's own Google account through OAuth. It uses Google Sheets and Google Drive access only to:

- create a new spreadsheet for each attendance session (copied from a template),
- write attendance rows into that spreadsheet, and
- export the spreadsheet as an Excel (.xlsx) file for the instructor.

The App does not read, modify, or delete any other files in the Google account.

## What data is collected from students

When a student submits attendance, the App records:

- name, student ID, and email address,
- a device identifier,
- the student's approximate location at the moment of submission (used only to confirm they are in the lecture hall),
- the time of submission and the attendance status.

This data is written to the attendance spreadsheet for that session. A confirmation email is sent to the address the student provided.

## How the data is used

The data is used only to record and verify lecture attendance. It is not used for advertising, profiling, or any other purpose.

## Sharing

The data is not sold, rented, or shared with third parties. It is visible only to the instructor who owns the spreadsheet. The App relies on Google (Sheets, Drive, Gmail) and n8n to operate, and data passes through those services under their own terms and privacy policies.

## Google API Services User Data Policy

The App's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Retention and deletion

Attendance spreadsheets stay in the instructor's Google Drive until the instructor deletes them. A student who wants their record removed can contact the developer, and it will be deleted from the relevant spreadsheet.

## Contact

Questions or deletion requests: open an issue at
https://github.com/Abdelrahman-Noaman/dynamic-qr-attendance/issues

## Changes

If this policy changes, the updated version will be published in this repository with a new "Last updated" date.
