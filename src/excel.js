import ExcelJS from 'exceljs';
export async function readWorkbook(buffer) {
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(buffer);
 const sheets=workbook.worksheets.map(sheet=>({name:sheet.name, rows:[]}));
 workbook.worksheets.forEach((sheet,index)=>{sheet.eachRow(row=>{sheets[index].rows.push(row.values.slice(1).map(v=>{if(v&&typeof v==='object'){if('result'in v)return v.result;if('text'in v)return v.text;if('richText'in v)return v.richText.map(r=>r.text).join('');throw new Error('工作簿含没有缓存结果的公式，请先在 Excel 中计算并保存，或导出 CSV。');}return v??'';}));});});
 return sheets;
}
