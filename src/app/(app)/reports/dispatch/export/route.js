import { excelDownload, dispatchSheets } from '@/lib/reportSheets';

export const GET = (req) => excelDownload(req, 'Market Going', dispatchSheets);
