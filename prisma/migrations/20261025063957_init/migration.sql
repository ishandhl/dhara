-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'QC', 'PRODUCTION', 'STORE', 'DISPATCH', 'ACCOUNTS');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING_QC', 'ACCEPTED', 'UNLOADED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MILK',
    "unitName" TEXT NOT NULL DEFAULT 'packet',
    "litresPerUnit" DOUBLE PRECISION NOT NULL,
    "shelfLifeDays" INTEGER NOT NULL DEFAULT 2,
    "crateSize" INTEGER,
    "fatStdPct" DOUBLE PRECISION,
    "snfStdPct" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Silo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "capacityL" DOUBLE PRECISION NOT NULL,
    "correctionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Silo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DipPoint" (
    "id" SERIAL NOT NULL,
    "siloId" INTEGER NOT NULL,
    "cm" DOUBLE PRECISION NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DipPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COLLECTION_CENTRE',
    "contact" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tanker" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "capacityL" DOUBLE PRECISION,
    "supplierId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tanker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distributor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "routeId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "driver" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "allowedWastagePct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PackagingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPackaging" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "packagingItemId" INTEGER NOT NULL,
    "qtyPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossReason" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'PROCESS',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LossReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tolerance" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "greenPct" DOUBLE PRECISION NOT NULL,
    "amberPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Tolerance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MilkReceipt" (
    "id" SERIAL NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tankerId" INTEGER,
    "vehicleNo" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "supplierQtyL" DOUBLE PRECISION NOT NULL,
    "supplierFat" DOUBLE PRECISION,
    "supplierSnf" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING_QC',
    "fatPct" DOUBLE PRECISION,
    "snfPct" DOUBLE PRECISION,
    "acidityPct" DOUBLE PRECISION,
    "cobTest" TEXT,
    "alcoholTest" TEXT,
    "adulteration" TEXT,
    "qcRemarks" TEXT,
    "rejectReason" TEXT,
    "qcById" INTEGER,
    "qcAt" TIMESTAMP(3),
    "siloId" INTEGER,
    "dipBeforeCm" DOUBLE PRECISION,
    "dipAfterCm" DOUBLE PRECISION,
    "litresBefore" DOUBLE PRECISION,
    "litresAfter" DOUBLE PRECISION,
    "dipLitres" DOUBLE PRECISION,
    "factor" DOUBLE PRECISION,
    "ourQtyL" DOUBLE PRECISION,
    "kgFat" DOUBLE PRECISION,
    "kgSnf" DOUBLE PRECISION,
    "differenceL" DOUBLE PRECISION,
    "differencePct" DOUBLE PRECISION,
    "unloadedById" INTEGER,
    "unloadedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelReason" TEXT,

    CONSTRAINT "MilkReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiloMovement" (
    "id" SERIAL NOT NULL,
    "siloId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "kgFat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kgSnf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiloMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiloDip" (
    "id" SERIAL NOT NULL,
    "siloId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CLOSING',
    "dipCm" DOUBLE PRECISION NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "systemLitres" DOUBLE PRECISION NOT NULL,
    "varianceL" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiloDip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "batchNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "fatPct" DOUBLE PRECISION,
    "snfPct" DOUBLE PRECISION,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" INTEGER,
    "closedAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchInput" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "siloId" INTEGER NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "fatPct" DOUBLE PRECISION,
    "snfPct" DOUBLE PRECISION,

    CONSTRAINT "BatchInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchOutput" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "expiryDate" DATE NOT NULL,

    CONSTRAINT "BatchOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchLoss" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "reasonId" INTEGER NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "BatchLoss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchByProduct" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "fatPct" DOUBLE PRECISION,

    CONSTRAINT "BatchByProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchPackaging" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "packagingItemId" INTEGER NOT NULL,
    "qtyUsed" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BatchPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNo" TEXT,
    "expiryDate" DATE,
    "type" TEXT NOT NULL,
    "qtyUnits" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingLedger" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "packagingItemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "refType" TEXT,
    "refId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagingLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Silo_name_key" ON "Silo"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DipPoint_siloId_cm_key" ON "DipPoint"("siloId", "cm");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tanker_number_key" ON "Tanker"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Route_name_key" ON "Route"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_name_key" ON "Distributor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_number_key" ON "Vehicle"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingItem_name_key" ON "PackagingItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackaging_productId_packagingItemId_key" ON "ProductPackaging"("productId", "packagingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LossReason_name_appliesTo_key" ON "LossReason"("name", "appliesTo");

-- CreateIndex
CREATE UNIQUE INDEX "Tolerance_key_key" ON "Tolerance"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MilkReceipt_receiptNo_key" ON "MilkReceipt"("receiptNo");

-- CreateIndex
CREATE INDEX "MilkReceipt_date_idx" ON "MilkReceipt"("date");

-- CreateIndex
CREATE INDEX "SiloMovement_siloId_date_idx" ON "SiloMovement"("siloId", "date");

-- CreateIndex
CREATE INDEX "SiloMovement_refType_refId_idx" ON "SiloMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "SiloDip_siloId_date_idx" ON "SiloDip"("siloId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchNo_key" ON "Batch"("batchNo");

-- CreateIndex
CREATE INDEX "Batch_date_idx" ON "Batch"("date");

-- CreateIndex
CREATE INDEX "StockLedger_productId_batchNo_idx" ON "StockLedger"("productId", "batchNo");

-- CreateIndex
CREATE INDEX "StockLedger_date_idx" ON "StockLedger"("date");

-- CreateIndex
CREATE INDEX "PackagingLedger_packagingItemId_date_idx" ON "PackagingLedger"("packagingItemId", "date");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DipPoint" ADD CONSTRAINT "DipPoint_siloId_fkey" FOREIGN KEY ("siloId") REFERENCES "Silo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tanker" ADD CONSTRAINT "Tanker_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkReceipt" ADD CONSTRAINT "MilkReceipt_tankerId_fkey" FOREIGN KEY ("tankerId") REFERENCES "Tanker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilkReceipt" ADD CONSTRAINT "MilkReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiloMovement" ADD CONSTRAINT "SiloMovement_siloId_fkey" FOREIGN KEY ("siloId") REFERENCES "Silo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiloDip" ADD CONSTRAINT "SiloDip_siloId_fkey" FOREIGN KEY ("siloId") REFERENCES "Silo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchInput" ADD CONSTRAINT "BatchInput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOutput" ADD CONSTRAINT "BatchOutput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOutput" ADD CONSTRAINT "BatchOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchLoss" ADD CONSTRAINT "BatchLoss_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchLoss" ADD CONSTRAINT "BatchLoss_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "LossReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchByProduct" ADD CONSTRAINT "BatchByProduct_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingLedger" ADD CONSTRAINT "PackagingLedger_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
