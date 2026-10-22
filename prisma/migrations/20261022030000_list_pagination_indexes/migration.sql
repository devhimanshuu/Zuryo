-- List pagination: the customer and trainer list screens filter by status and read one page
-- ordered by startAt, operations reads the newest bookings first, packages are newest-first per
-- customer, and notifications are newest-first per recipient. Additive indexes only.

-- CreateIndex
CREATE INDEX "Booking_customerId_status_startAt_idx" ON "Booking"("customerId", "status", "startAt");

-- CreateIndex
CREATE INDEX "Booking_trainerId_status_startAt_idx" ON "Booking"("trainerId", "status", "startAt");

-- CreateIndex
CREATE INDEX "Booking_startAt_idx" ON "Booking"("startAt" DESC);

-- CreateIndex
CREATE INDEX "Package_customerId_purchasedAt_idx" ON "Package"("customerId", "purchasedAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt" DESC);
