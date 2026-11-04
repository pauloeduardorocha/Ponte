CREATE TABLE conversation_posts (
  id UUID PRIMARY KEY,
  "authorId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "topicId" UUID REFERENCES conversation_posts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  title VARCHAR(160),
  body VARCHAR(10000) NOT NULL,
  image TEXT,
  "hasImage" BOOLEAN NOT NULL DEFAULT false,
  mentions UUID[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deletedAt" TIMESTAMPTZ(6),
  "deletedBy" UUID,
  CONSTRAINT conversation_post_kind CHECK (
    ("topicId" IS NULL AND title IS NOT NULL) OR ("topicId" IS NOT NULL AND title IS NULL)
  )
);
CREATE INDEX "conversation_posts_topicId_createdAt_id_idx" ON conversation_posts("topicId", "createdAt", id);
CREATE INDEX "conversation_posts_authorId_idx" ON conversation_posts("authorId");
