# Changelog — Garage OS v3.9.0

- Removed guessed ownership-distance estimates. Purchase distance is actual odometer subtraction only; no purchase age is calculated if the real date is unknown.
- Added staged maintenance reminders (upcoming, due, overdue, critical) ranked by urgency.
- Added a protected `/scheduled/reminders` endpoint and a daily GitHub Actions workflow at approximately 09:00 Asia/Tehran.
- Reminder state is stored by maintenance cycle and sends only on first entry or escalation to a higher stage, avoiding repeat notifications at the same stage.
- Added `/issues` quick triage with inline buttons for detail and closure of active issues.
- Added pre-save anomaly review with Save anyway / Edit / Cancel for implausible mileage, fuel quantity and amounts.
- Preserved the default purchase odometer baseline for unrecorded periodic maintenance; elapsed days remain unknown until a real purchase date or maintenance date is recorded.
- Updated tests, BotFather command list and Persian documentation.
