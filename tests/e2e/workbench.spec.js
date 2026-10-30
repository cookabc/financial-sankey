import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';

test('generates, validates and downloads a balanced chart', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#sankey')).toBeVisible();
  await page.locator('#data-text').fill('Income,Total,100\nTotal,Cost,60\nTotal,Profit,40');
  await expect(page.locator('#svg-btn')).toBeDisabled();
  await page.locator('#generate-btn').click();
  await expect(page.locator('#chart-status')).toContainText('Flows balanced');
  await expect(page.locator('#svg-btn')).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await page.locator('#svg-btn').click();
  const download = await downloading;
  const svg = await readFile(await download.path(), 'utf8');
  expect(svg).toContain('<svg');expect(svg).toContain('Profit');
  const pngDownloading = page.waitForEvent('download');
  await page.locator('#png-btn').click();
  const png = await pngDownloading;
  expect((await readFile(await png.path())).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  await expect(page.locator('#png-btn')).toBeEnabled();
  await page.locator('#data-text').fill('Income,Total,100\nTotal,Cost,60');
  await page.locator('#generate-btn').click();
  await expect(page.locator('#svg-btn')).toBeDisabled();
  await expect(page.locator('#validation-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('imports locally, reloads the project and downloads Guide documents', async ({ page }) => {
  await page.goto('/');
  await page.locator('#data-file').setInputFiles({ name: 'flows.csv', mimeType: 'text/csv', buffer: Buffer.from('Source,Total,50\nTotal,Target,50') });
  await expect(page.locator('#import-feedback')).toContainText('flows.csv');
  await expect(page.locator('#svg-btn')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#data-text')).toHaveValue(/Source/);
  await expect(page.locator('#chart-status')).toContainText('Flows balanced');
  const response = await page.request.get('/financial-format.md');
  expect(response.ok()).toBe(true);expect(await response.text()).toContain('liuzhang');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('keyboard tabs, file chooser and language remain usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Flow data', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Income statement', exact: true })).toBeFocused();
  await expect(page.locator('#finance-panel')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.locator('#data-panel')).toBeVisible();
  await page.locator('#dropzone').focus();
  const choosing = page.waitForEvent('filechooser');await page.keyboard.press('Enter');
  const chooser = await choosing;expect(chooser.isMultiple()).toBe(false);
  await page.locator('#lang-btn').click();
  await expect(page.locator('#generate-btn')).toContainText('生成桑基图');
});

test('Excel parser loads only when a workbook is imported', async ({ page }) => {
  const excelRequests = [];
  page.on('request', request => { if (/assets\/excel-.*\.js/.test(request.url())) excelRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('#sankey')).toBeVisible();
  expect(excelRequests).toHaveLength(0);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Flows').addRows([['Source', 'Target', 'Amount'], ['Income', 'Total', 100], ['Total', 'Profit', 100]]);
  await page.locator('#data-file').setInputFiles({ name: 'workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  await expect(page.locator('#import-feedback')).toContainText('workbook.xlsx');
  await expect(page.locator('#svg-btn')).toBeEnabled();
  expect(excelRequests).toHaveLength(1);
});

test('320 px layout keeps header actions and editor inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.locator('#sankey')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('#help-btn')).toBeInViewport();
  await page.locator('#dropzone').scrollIntoViewIfNeeded();
  await expect(page.locator('#dropzone')).toBeInViewport();
});
