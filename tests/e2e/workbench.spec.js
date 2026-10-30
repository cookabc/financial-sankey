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

test('sample presentation, controls and exported chart follow the language without rewriting input',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#f-revenue')).toHaveAttribute('aria-label','Revenue');
 const raw=await page.locator('#data-text').inputValue();
 for(let index=0;index<9;index++){
  await page.locator('#sample-btn').click();await page.locator(`[data-example="${index}"]`).click();
  await expect(page.locator('#sankey')).toBeVisible();
  expect(await page.locator('#sankey').textContent()).not.toMatch(/[\p{Script=Han}]/u);
  expect(await page.locator('#source-card').textContent()).not.toMatch(/[\p{Script=Han}]/u);
 }
 await page.locator('#sample-btn').click();await page.locator('[data-example="0"]').click();
 await page.locator('#lang-btn').click();
 await expect(page.locator('#f-revenue')).toHaveAttribute('aria-label','营业收入');
 await expect(page.locator('#sankey')).toContainText('成本与费用');
 await expect(page.locator('#row-count')).toContainText('条已生效');
 await page.locator('#lang-btn').click();
 await expect(page.locator('#row-count')).toContainText('active flows');
 await expect(page.locator('#data-text')).toHaveValue(raw);
 const pending=page.waitForEvent('download');await page.locator('#svg-btn').click();
 const file=await pending,svg=await readFile(await file.path(),'utf8');
 expect(svg).toContain('Costs and expenses');expect(svg).toContain('Liuzhang');
 await page.locator('#data-text').fill('客户收入,客户利润,10');await page.locator('#generate-btn').click();
 await expect(page.locator('#sankey')).toContainText('客户收入');
 const input=await page.locator('#data-text').inputValue();
 await page.locator('#lang-btn').click();await page.locator('#lang-btn').click();
 await expect(page.locator('#data-text')).toHaveValue(input);
 await expect(page.locator('#sankey')).toContainText('客户利润');
});

test('a visible validation failure changes language with the interface',async({page})=>{
 await page.goto('/');await page.locator('#finance-tab').click();
 await expect(page.locator('#input-error')).toContainText('Complete every amount');
 await page.locator('#lang-btn').click();
 await expect(page.locator('#input-error')).toContainText('请完整填写金额');
 await page.locator('#lang-btn').click();
 await expect(page.locator('#input-error')).toContainText('Complete every amount');
});

test('a taller English chart keeps its footnotes and PNG aspect ratio',async({page})=>{
 await page.goto('/');
 await page.locator('#chain-input').evaluate(input=>{input.value='';input.dispatchEvent(new Event('change'));});
 const size=await page.locator('#sankey').evaluate(svg=>({width:Number(svg.getAttribute('width')),height:Number(svg.getAttribute('height'))}));
 const download=page.waitForEvent('download');await page.locator('#png-btn').click();
 const png=await readFile(await (await download).path());
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 expect(width/height).toBeCloseTo(size.width/size.height,2);
 expect(height).toBe(Math.round(size.height*Math.min(2,Math.sqrt(16e6/(size.width*size.height)))));
});
