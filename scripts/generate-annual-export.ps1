param([Parameter(Mandatory=$true)][string]$TemplatePath,[Parameter(Mandatory=$true)][string]$DataPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
function Norm($v){if($null -eq $v){return ''};return (($v.ToString()).ToLowerInvariant() -replace '[\s\-_\/().:+]+','')}
function Txt($s,$r,$c){return $s.Cells.Item($r,$c).Text.ToString().Trim()}
function Formula($c){$value=$c.Formula;return $value -is [string] -and $value.StartsWith("=")}
function Map($m,$k){$p=$m.PSObject.Properties[$k];if($p){return $p.Value};return $null}
function ClearValues($s,$r1,$r2,$c1,$c2){for($r=$r1;$r -le $r2;$r++){for($c=$c1;$c -le $c2;$c++){$cell=$s.Cells.Item($r,$c);if(-not(Formula $cell)){$cell.Value2=$null}}}}
function SafeName($name,$index,$used){$safe=($name -replace '[\\/\?\*\[\]:]',' ').Trim();if(!$safe){$safe="Employee $index"};if($safe.Length -gt 31){$safe=$safe.Substring(0,31)};$candidate=$safe;$n=2;while($used.ContainsKey($candidate)){$candidate=$safe.Substring(0,[Math]::Min(27,$safe.Length))+" ($n)";$n++};$used[$candidate]=$true;return $candidate}
function FillSummary($s,$data){ClearValues $s 3 14 2 5;foreach($row in @($data.summary)){$r=[int]$row.month+2;$s.Cells.Item($r,2).Value2=[double]$row.employeeGross;$s.Cells.Item($r,3).Value2=[double]$row.directorGross;$s.Cells.Item($r,4).Value2=[double]$row.employeeBonus;$s.Cells.Item($r,5).Value2=[double]$row.directorBonus};$s.Calculate()}
function FillPayroll($s,$employee,$data){
 $last=$s.UsedRange.Columns.Count
 ClearValues $s 3 14 2 $last
 foreach($entry in @($employee.entries)){
  $row=[int]$entry.month+2
  for($column=2;$column -le $last;$column++){
   $key=Norm(Txt $s 2 $column)
   $code=Map $data.itemHeaderCodes $key
   $special=Map $data.specialHeaderCodes $key
   $cell=$s.Cells.Item($row,$column)
   if($code){$value=Map $entry.items $code;if($null -ne $value -and -not(Formula $cell)){$cell.Value2=[double]$value}}
   elseif($special -eq 'gross' -and -not(Formula $cell)){$cell.Value2=[double]$entry.gross}
   elseif($special -eq 'deductions' -and -not(Formula $cell)){$cell.Value2=[double]$entry.deductions}
   elseif($special -eq 'net' -and -not(Formula $cell)){$cell.Value2=[double]$entry.net}
  }
 }
}
function FillHireDate($s,$employee,$data){
 if(-not $employee.hireDate){return}
 for($row=15;$row -le $s.UsedRange.Rows.Count;$row++){
  if((Txt $s $row 1).Contains($data.labels.hireDate)){
   $cell=$s.Cells.Item($row,2)
   $cell.Value=[datetime]::ParseExact($employee.hireDate,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
   return
  }
 }
}
function FillLeaves($s,$employee,$data){
 $last=$s.UsedRange.Columns.Count
 $dateColumn=0
 $typeColumns=@{}
 for($column=2;$column -le $last;$column++){
  $key=Norm(Txt $s 2 $column)
  if($data.leaveDateHeaderKeys -contains $key){$dateColumn=$column}
  $kind=Map $data.leaveHeaderCodes $key
  if($kind){$typeColumns[$kind]=$column}
 }
 if(-not $dateColumn){return}
 ClearValues $s 3 16 $dateColumn $last
 $index=0
 foreach($leave in @($employee.leaves)){
  if($index -ge 14){break}
  $row=3+$index
  $dateCell=$s.Cells.Item($row,$dateColumn)
  $dateCell.Value=[datetime]::ParseExact($leave.dateFrom,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
  $typeColumn=$typeColumns[$leave.type]
  if($typeColumn){$daysCell=$s.Cells.Item($row,$typeColumn);$daysCell.Value2=[double]$leave.days}
  if($last -gt $dateColumn){$reasonCell=$s.Cells.Item($row,$last);$reasonCell.Value2=[string]$leave.reason}
  $index++
 }
}
function FillAdjustments($s,$employee,$data){
 $titleRow=0
 for($row=15;$row -le $s.UsedRange.Rows.Count;$row++){
  if((Txt $s $row 1).Contains($data.labels.adjustmentTitle)){$titleRow=$row;break}
 }
 if(-not $titleRow){return}
 $titleCell=$s.Cells.Item($titleRow,1)
 $titleCell.Value2="$($data.labels.adjustmentTitle) $($employee.fullName)"
 $startRow=$titleRow+2
 $endRow=$s.UsedRange.Rows.Count
 $neededRow=$startRow+@($employee.adjustments).Count-1
 while($endRow -lt $neededRow){[void]$s.Rows.Item($endRow).Copy($s.Rows.Item($endRow+1));$endRow++}
 ClearValues $s $startRow $endRow 1 6
 $adjustmentRows=@($employee.adjustments)
 for($index=0;$index -lt $adjustmentRows.Count;$index++){
  $record=$adjustmentRows[$index]
  $row=$startRow+$index
  $dateCell=$s.Cells.Item($row,1)
  $dateCell.Value=[datetime]::ParseExact($record.effectiveDate,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
 }
 for($index=0;$index -lt $adjustmentRows.Count;$index++){
  $row=$startRow+$index
  $salaryCell=$s.Cells.Item($row,2)
  $salaryCell.Value2=[double]$employee.adjustments[$index].newSalary
  $amountCell=$s.Cells.Item($row,3)
  $amountCell.Value2=([double]$employee.adjustments[$index].newSalary-[double]$employee.adjustments[$index].oldSalary)
  if([double]$employee.adjustments[$index].oldSalary -ne 0){
   $percentCell=$s.Cells.Item($row,4)
   $percentCell.Value2=([double]$employee.adjustments[$index].newSalary-[double]$employee.adjustments[$index].oldSalary)/[double]$employee.adjustments[$index].oldSalary
  }
  $reasonCell=$s.Cells.Item($row,5)
  $reasonCell.Value2=[string]$employee.adjustments[$index].reason
  if($employee.adjustments[$index].note -and -not($employee.adjustments[$index].note.StartsWith('Annual historical import'))){
   if($employee.adjustments[$index].reason){$reasonCell.Value2="$($employee.adjustments[$index].reason) - $($employee.adjustments[$index].note)"}else{$reasonCell.Value2=[string]$employee.adjustments[$index].note}
  }
 }
}
function FillEmployee($s,$employee,$data){
 FillPayroll $s $employee $data
 FillHireDate $s $employee $data
 FillLeaves $s $employee $data
 FillAdjustments $s $employee $data
 $titleCell=$s.Cells.Item(1,1)
 $titleCell.Value2="$($data.labels.employeeTitle) $($employee.fullName) $([int]$data.year+543)"
 $s.Calculate()
}
$template=(Resolve-Path -LiteralPath $TemplatePath).Path;$output=[IO.Path]::GetFullPath($OutputPath);$parent=Split-Path -Parent $output;if(-not(Test-Path $parent)){New-Item -ItemType Directory -Path $parent | Out-Null};if(Test-Path $output){Remove-Item $output -Force};$data=Get-Content -Encoding UTF8 -Raw -LiteralPath $DataPath | ConvertFrom-Json
$excel=$null;$book=$null
try{$excel=New-Object -ComObject Excel.Application;$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.AskToUpdateLinks=$false;$excel.EnableEvents=$false;$excel.AutomationSecurity=3;Copy-Item $template $output -Force;Unblock-File $output;$book=$excel.Workbooks.Open($output,0,$false);$excel.Calculation=-4135;$excel.CalculateBeforeSave=$false;$templates=@();for($i=1;$i -le $book.Worksheets.Count;$i++){$s=$book.Worksheets.Item($i);if($s.UsedRange.Rows.Count -ge 17 -and (Txt $s 2 1).Length -gt 0 -and (Txt $s 2 2).Length -gt 0){$templates+=@($s)}};if(!$templates.Count){throw 'Employee template not found'};if($templates.Count -lt $data.employees.Count){throw "Template has insufficient employee sheets"};$sheets=@($templates | Sort-Object {$_.UsedRange.Columns.Count} -Descending | Select-Object -First $data.employees.Count);$needed=@($sheets | ForEach-Object {$_.Name});foreach($s in $templates){if($needed -notcontains $s.Name){$s.Delete()}};$summary=$null;for($i=1;$i -le $book.Worksheets.Count;$i++){if($needed -notcontains $book.Worksheets.Item($i).Name){$summary=$book.Worksheets.Item($i);break}};$used=@{};for($i=0;$i -lt $data.employees.Count;$i++){$s=$sheets[$i];$s.Name=SafeName $data.employees[$i].fullName ($i+1) $used;FillEmployee $s $data.employees[$i] $data};if($summary){FillSummary $summary $data;$summary.Cells.Item(1,1).Value2="$($data.labels.companySummaryTitle) $([int]$data.year+543)"};$book.Save();$book.Close($true);$book=$null}finally{if($book){$book.Close($false)};if($excel){$excel.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)};[GC]::Collect();[GC]::WaitForPendingFinalizers()}
