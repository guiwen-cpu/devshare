-- CreateTable
CREATE TABLE "teachers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "avatar" TEXT,
    "bio" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "cover" TEXT,
    "summary" VARCHAR(500),
    "audience" TEXT[],
    "difficulty" TEXT NOT NULL DEFAULT 'beginner',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "originalPriceCents" INTEGER,
    "badge" VARCHAR(20),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "teacherId" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_tags" (
    "courseId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "course_tags_pkey" PRIMARY KEY ("courseId","tagId")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_status_sortOrder_idx" ON "courses"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "courses_teacherId_idx" ON "courses"("teacherId");

-- CreateIndex
CREATE INDEX "enrollments_courseId_status_idx" ON "enrollments"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseId_key" ON "enrollments"("userId", "courseId");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_tags" ADD CONSTRAINT "course_tags_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_tags" ADD CONSTRAINT "course_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
