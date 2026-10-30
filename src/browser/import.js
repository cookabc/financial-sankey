import { parseText, rowsToLinks } from '../core/table-data.js';
import { restoreProject } from './project.js';

/** Read and validate without changing the active document or its workbook. */
export async function readImportFile(file, { projectOnly = false } = {}) {
  if (file.size > (projectOnly ? 1 : 5) * 1024 * 1024) throw new Error('File is too large. Use a project under 1 MB or table under 5 MB.');
  if (/\.json$/i.test(file.name)) return { kind: 'project', project: restoreProject(JSON.parse(await file.text())) };
  if (projectOnly) throw new Error('Choose a JSON project file.');
  if (/\.xlsx$/i.test(file.name)) {
    const { readWorkbook } = await import('../excel.js');
    const sheets = await readWorkbook(await file.arrayBuffer());
    if (!sheets.length) throw new Error('No readable sheets. Choose a workbook containing flow data.');
    return { kind: 'workbook', sheets, links: rowsToLinks(sheets[0].rows) };
  }
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return { kind: 'table', links: parseText(await file.text()) };
  throw new Error('Choose a CSV, TSV, TXT, XLSX or JSON file.');
}

/** Only the latest request may commit or report a failure. Edits cancel a read. */
export function createImportCoordinator({ commit, onError, onPending = () => {}, read = readImportFile }) {
  let revision = 0;
  return {
    cancel() { ++revision; onPending(false); },
    async import(file, options) {
      if (!file) return;
      const request = ++revision;
      onPending(true);
      try {
        const result = await read(file, options);
        if (request === revision) commit(result, file);
      } catch (error) {
        if (request === revision) onError(error);
      } finally {
        if (request === revision) onPending(false);
      }
    },
  };
}
