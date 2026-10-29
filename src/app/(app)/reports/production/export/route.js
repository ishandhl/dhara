import { excelDownload, productionSheets } from '@/lib/reportSheets';

export const GET = (req) => excelDownload(req, 'Production', productionSheets);
