CREATE TABLE reimbursement_submissions (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL,
  payload jsonb NOT NULL,
  "reimbursementId" uuid,
  "expiresAt" timestamptz(6) NOT NULL
);
CREATE INDEX "reimbursement_submissions_userId_expiresAt_idx" ON reimbursement_submissions ("userId", "expiresAt");
CREATE INDEX "reimbursement_submissions_expiresAt_idx" ON reimbursement_submissions ("expiresAt");
CREATE TABLE reimbursement_upload_chunks (
  "submissionId" uuid NOT NULL REFERENCES reimbursement_submissions(id) ON DELETE CASCADE,
  "fileIndex" integer NOT NULL CHECK ("fileIndex" BETWEEN 0 AND 2),
  "offset" integer NOT NULL CHECK ("offset" >= 0),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 262144),
  PRIMARY KEY ("submissionId", "fileIndex", "offset")
);
