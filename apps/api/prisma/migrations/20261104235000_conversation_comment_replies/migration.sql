ALTER TABLE conversation_posts ADD COLUMN "parentId" UUID;
ALTER TABLE conversation_posts ADD CONSTRAINT conversation_parent_only_comments
  CHECK ("parentId" IS NULL OR ("topicId" IS NOT NULL AND "parentId" <> id));
ALTER TABLE conversation_posts ADD CONSTRAINT "conversation_posts_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES conversation_posts(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "conversation_posts_parentId_createdAt_id_idx" ON conversation_posts("parentId", "createdAt", id);
