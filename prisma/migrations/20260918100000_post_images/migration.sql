-- CreateTable
CREATE TABLE "PostImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "postId" INTEGER NOT NULL,
    CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "PostImage" ("url", "order", "postId")
SELECT "imageUrl", 0, "id" FROM "Post" WHERE "imageUrl" IS NOT NULL;
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "new_Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER NOT NULL,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Post" ("id", "content", "createdAt", "authorId")
SELECT "id", "content", "createdAt", "authorId" FROM "Post";

DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";

PRAGMA foreign_keys=ON;