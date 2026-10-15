-- New users start with "Send My Report to Email" enabled by default, so a
-- first-time scan can actually trigger the PDF report email without the
-- user first finding the Profile toggle.
ALTER TABLE users ALTER COLUMN send_report_email SET DEFAULT true;
