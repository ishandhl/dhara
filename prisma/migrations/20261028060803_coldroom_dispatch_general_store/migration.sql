-- AlterTable
ALTER TABLE "BatchOutput" ALTER COLUMN "units" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PackagingItem" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'PACKAGING',
ADD COLUMN     "reorderLevel" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PackagingLedger" ADD COLUMN     "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "party" TEXT;

-- AlterTable
ALTER TABLE "StockLedger" ALTER COLUMN "qtyUnits" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Challan" (
    "id" SERIAL NOT NULL,
    "challanNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "distributorId" INTEGER,
    "vehicleId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Challan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallanLine" (
    "id" SERIAL NOT NULL,
    "challanId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ChallanLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreEntry" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "reasonId" INTEGER,
    "distributorId" INTEGER,
    "sellable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "cancelReason" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "productId" INTEGER NOT NULL,
    "countQty" DOUBLE PRECISION NOT NULL,
    "systemQty" DOUBLE PRECISION NOT NULL,
    "diffQty" DOUBLE PRECISION NOT NULL,
    "remark" TEXT,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challan_challanNo_key" ON "Challan"("challanNo");

-- CreateIndex
CREATE INDEX "Challan_date_idx" ON "Challan"("date");

-- CreateIndex
CREATE INDEX "StoreEntry_date_idx" ON "StoreEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_date_productId_key" ON "StockCount"("date", "productId");

-- AddForeignKey
ALTER TABLE "Challan" ADD CONSTRAINT "Challan_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challan" ADD CONSTRAINT "Challan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallanLine" ADD CONSTRAINT "ChallanLine_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "Challan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallanLine" ADD CONSTRAINT "ChallanLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEntry" ADD CONSTRAINT "StoreEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEntry" ADD CONSTRAINT "StoreEntry_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "LossReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEntry" ADD CONSTRAINT "StoreEntry_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
