-- 全部课程改为公益免费：移除价格与支付相关字段，报名状态统一为 enrolled
ALTER TABLE "enrollments" ALTER COLUMN "status" SET DEFAULT 'enrolled';

UPDATE "enrollments" SET "status" = 'enrolled' WHERE "status" = 'paid';

ALTER TABLE "courses" DROP COLUMN "priceCents";
ALTER TABLE "courses" DROP COLUMN "originalPriceCents";
ALTER TABLE "enrollments" DROP COLUMN "amountCents";