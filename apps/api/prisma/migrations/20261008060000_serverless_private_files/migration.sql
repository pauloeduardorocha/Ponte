CREATE TABLE "private_files" (
    "id" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "private_files_pkey" PRIMARY KEY ("id")
);
