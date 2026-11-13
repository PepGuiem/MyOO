-- Administración: roles y baneos, ideas con votos, denuncias, novedades,
-- notificaciones y registro de acciones de los admins.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "IdeaCategory" AS ENUM ('FEATURE', 'IMPROVEMENT', 'BUG', 'OTHER');
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED');
CREATE TYPE "ReportTarget" AS ENUM ('USER', 'MESSAGE', 'OUTFIT', 'IDEA');
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'IMPERSONATION', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ReleaseTag" AS ENUM ('NEW', 'IMPROVED', 'FIXED');
CREATE TYPE "NotificationType" AS ENUM ('RELEASE', 'IDEA_STATUS', 'IDEA_REPLY', 'FOLLOW_REQUEST', 'NEW_FOLLOWER', 'FOLLOW_ACCEPTED', 'REPORT_UPDATE');

-- AlterTable: rol y baneo (nadie es admin hasta usar `npm run admin:grant`)
ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "bannedAt" TIMESTAMP(3),
  ADD COLUMN "bannedUntil" TIMESTAMP(3),
  ADD COLUMN "banReason" VARCHAR(300);

-- AlterTable: moderación de outfits compartidos
ALTER TABLE "Outfit" ADD COLUMN "hiddenByAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Idea" (
    "id" UUID NOT NULL,
    "authorId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "category" "IdeaCategory" NOT NULL DEFAULT 'FEATURE',
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "adminReply" VARCHAR(2000),
    "repliedAt" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" UUID,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaVote" (
    "ideaId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaVote_pkey" PRIMARY KEY ("ideaId","userId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporterId" UUID,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "targetUserId" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "snapshot" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" VARCHAR(300),
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "version" VARCHAR(30),
    "body" VARCHAR(8000) NOT NULL,
    "tags" "ReleaseTag"[] DEFAULT ARRAY[]::"ReleaseTag"[],
    "publishedAt" TIMESTAMP(3),
    "authorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500),
    "link" VARCHAR(200),
    "actorId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" UUID NOT NULL,
    "adminId" UUID,
    "action" VARCHAR(40) NOT NULL,
    "targetUserId" UUID,
    "targetId" UUID,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Idea_hidden_pinned_voteCount_idx" ON "Idea"("hidden", "pinned", "voteCount");
CREATE INDEX "Idea_hidden_createdAt_idx" ON "Idea"("hidden", "createdAt");
CREATE INDEX "Idea_authorId_createdAt_idx" ON "Idea"("authorId", "createdAt");
CREATE INDEX "IdeaVote_userId_idx" ON "IdeaVote"("userId");
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_targetUserId_idx" ON "Report"("targetUserId");
CREATE INDEX "Release_publishedAt_idx" ON "Release"("publishedAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");
CREATE INDEX "AdminAction_targetUserId_idx" ON "AdminAction"("targetUserId");

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
