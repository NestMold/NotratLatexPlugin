# ================================================================
#  figs/build.ps1 —— build.sh 的 PowerShell 版（不想开 Git Bash 时用）
#
#  用法：  powershell -ExecutionPolicy Bypass -File samples\figs\build.ps1
# ================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command latexmk -ErrorAction SilentlyContinue)) {
    Write-Host "X 找不到 latexmk。MiKTeX 的路径通常在 C:\Program Files\MiKTeX\miktex\bin\x64" -ForegroundColor Red
    exit 127
}

$figs = @(Get-ChildItem -Filter *.tex)
if ($figs.Count -eq 0) { Write-Host "figs\ 下没有 .tex 图源，无事可做。"; exit 0 }

Write-Host "> 图形源目录：$PWD"
foreach ($f in $figs) {
    Write-Host ("  . {0,-22} " -f $f.Name) -NoNewline
    & latexmk -xelatex -norc -silent -interaction=nonstopmode -halt-on-error $f.Name | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X 编译失败 -> 看 $($f.BaseName).log" -ForegroundColor Red
        exit 1
    }
    & latexmk -c -norc $f.Name | Out-Null
    Write-Host "-> $($f.BaseName).pdf   OK"
}

Write-Host "OK 全部图形已导出：" -ForegroundColor Green
Get-ChildItem -Filter *.pdf | ForEach-Object { Write-Host "    $($_.Name)" }
Write-Host ""
Write-Host "提示：正文里这样引：\includegraphics[...]{figs/<名字>.pdf}"
Write-Host "      必须写全 .pdf 后缀 -- 本目录同时有同名 .tex 图源，"
Write-Host "      不带后缀时预览的资产通道会先命中那个 .tex，图就不显示了。"
