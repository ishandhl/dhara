-- CreateTable
CREATE TABLE "BatchIngredient" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "packagingItemId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BatchIngredient_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BatchIngredient" ADD CONSTRAINT "BatchIngredient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchIngredient" ADD CONSTRAINT "BatchIngredient_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
