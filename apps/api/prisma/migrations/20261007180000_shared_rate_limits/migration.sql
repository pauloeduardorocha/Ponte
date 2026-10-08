CREATE TABLE rate_limit_buckets (
 key VARCHAR(64) PRIMARY KEY,
 hits INTEGER NOT NULL CHECK(hits>=0),
 expires_at TIMESTAMPTZ(6) NOT NULL,
 blocked_until TIMESTAMPTZ(6)
);
CREATE INDEX rate_limit_expiry_idx ON rate_limit_buckets(expires_at);
