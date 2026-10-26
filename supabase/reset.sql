-- WARNING: this wipes the shared test data. Every decision, match and message for all testers is deleted.
-- Returns the test accounts to a fresh state: no decisions, matches or messages.
-- Profiles stay, so testers do not have to set them up again. Delete a profile by hand to test setup.
-- Administrative script: run it by hand against the shared project, never from the app.
-- Deleting matches also deletes their messages.

delete from public.profile_decisions;
delete from public.matches;
