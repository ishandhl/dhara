import { excelDownload, milkSheets } from '@/lib/reportSheets';

export const GET = (req) => excelDownload(req, 'Milk Collection', milkSheets);
