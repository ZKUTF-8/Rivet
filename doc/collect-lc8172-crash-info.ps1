#requires -Version 5.1
<#
  LC8172App 崩溃现场信息收集脚本
  ============================================================
  用途：
    在打不开 LC8172App.exe 的电脑上收集系统与崩溃证据，
    用于排查 0x80131506 / 启动即崩溃 / 部分电脑打不开 的问题。

  用法（在异常电脑上，右键 PowerShell 以管理员身份运行）：
    powershell -ExecutionPolicy Bypass -File .\collect-lc8172-crash-info.ps1

    如需包含崩溃转储（.dmp，可能很大）：
    powershell -ExecutionPolicy Bypass -File .\collect-lc8172-crash-info.ps1 -IncludeDumps

    如需顺带开启“本地转储”注册表设置（下次崩溃会留下完整 dump）：
    powershell -ExecutionPolicy Bypass -File .\collect-lc8172-crash-info.ps1 -EnableLocalDumps

  如果脚本没有自动找到 LC8172App.exe，可以手动指定：
    powershell -ExecutionPolicy Bypass -File .\collect-lc8172-crash-info.ps1 -AppPath "D:\上位机\LC8172App.exe"

  完成后会把结果打包到桌面：LC8172CrashInfo-<电脑名>-<时间>.zip，直接发回即可。
#>

[CmdletBinding()]
param(
    # LC8172App.exe 的完整路径，或程序所在目录（不填则自动搜索常见位置）
    [string]$AppPath = '',

    # 包含 WER 崩溃转储（.dmp 可能很大，默认不收集）
    [switch]$IncludeDumps,

    # 在 HKLM 中为 LC8172App.exe 开启 LocalDumps，下次崩溃留下完整 dump（需管理员）
    [switch]$EnableLocalDumps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ============ 输出基础设施 ============
$script:lines = New-Object System.Collections.Generic.List[string]
$script:startTime = Get-Date

function Add-Line([string]$text = '') {
    $script:lines.Add($text)
}

function Add-Section([string]$title) {
    Add-Line ''
    Add-Line ('=' * 78)
    Add-Line $title
    Add-Line ('=' * 78)
}

function Write-Report([string]$text = '') {
    Add-Line $text
    Write-Host $text
}

function Save-Report([string]$path) {
    $script:lines | Set-Content -LiteralPath $path -Encoding UTF8
}

# ============ 输出目录 ============
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outRoot = Join-Path ([Environment]::GetFolderPath('Desktop')) "LC8172CrashInfo-$env:COMPUTERNAME-$stamp"
$werOut = Join-Path $outRoot 'WER-Reports'
$logOut = Join-Path $outRoot 'App-Logs'
$dumpOut = Join-Path $outRoot 'LocalDumps'
New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
New-Item -ItemType Directory -Path $werOut -Force | Out-Null
New-Item -ItemType Directory -Path $logOut -Force | Out-Null
New-Item -ItemType Directory -Path $dumpOut -Force | Out-Null

Write-Host ''
Write-Host 'LC8172App 崩溃信息收集开始...' -ForegroundColor Cyan
Write-Host "输出目录: $outRoot" -ForegroundColor Cyan
Write-Host ''

# ============ 1. 系统信息 ============
Add-Section '1. 系统信息'

try {
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = Get-CimInstance Win32_Processor
    $osReg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop

    Add-Line ('计算机名    : ' + $env:COMPUTERNAME)
    Add-Line ('系统        : ' + $os.Caption + '  ' + $os.OSArchitecture)
    Add-Line ('版本号      : ' + $os.Version + '  (Build ' + $os.BuildNumber + ')')
    $displayVersion = if ($osReg.PSObject.Properties['DisplayVersion']) { $osReg.DisplayVersion } else { '(无)' }
    Add-Line ('显示版本    : ' + $displayVersion)
    Add-Line ('当前Build   : ' + $osReg.CurrentBuildNumber + '.' + $osReg.UBR)
    Add-Line ('产品名      : ' + $osReg.ProductName)
    Add-Line ('上次开机    : ' + $os.LastBootUpTime)
    Add-Line ('硬件        : ' + $cs.Manufacturer + ' ' + $cs.Model)
    $cpuInfo = ($cpu | ForEach-Object { $_.Name.Trim() } | Select-Object -Unique) -join '; '
    $cores = ($cpu | Measure-Object NumberOfCores -Sum).Sum
    $logical = ($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum
    Add-Line ('CPU         : ' + $cpuInfo)
    Add-Line ('CPU核心     : ' + $cores + ' 物理 / ' + $logical + ' 逻辑')
    $ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    Add-Line ('内存        : ' + $ramGB + ' GB (空闲约 ' + $freeGB + ' GB)')
    Add-Line '磁盘空间    :'
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        $free = [math]::Round($_.FreeSpace / 1GB, 1)
        $total = [math]::Round($_.Size / 1GB, 1)
        Add-Line ("              " + $_.DeviceID + "  空闲 " + $free + " GB / 共 " + $total + " GB")
    }
    Add-Line ('临时目录    : ' + $env:TEMP)
    $tempDrive = (Split-Path -Qualifier $env:TEMP)
    try {
        $tempFree = (Get-PSDrive ($tempDrive.TrimEnd(':'))).Free / 1GB
        Add-Line ('临时目录盘剩余: ' + [math]::Round($tempFree, 1) + ' GB')
    } catch { }
} catch {
    Add-Line ('获取系统信息失败: ' + $_.Exception.Message)
}

# ============ 2. 杀毒软件 ============
Add-Section '2. 杀毒软件 / 安全软件'
try {
    $av = Get-CimInstance -Namespace 'root\SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction Stop
    if ($av) {
        $av | ForEach-Object {
            Add-Line ('  ' + $_.displayName + '  (productState=0x' + ('{0:X8}' -f $_.productState) + ')')
        }
    } else {
        Add-Line '  未检测到第三方杀毒软件'
    }
} catch {
    Add-Line ('  无法读取安全中心信息: ' + $_.Exception.Message)
}

# ============ 3. 找到 LC8172App.exe ============
Add-Section '3. 应用程序定位'
$exePath = ''

if ($AppPath) {
    if (Test-Path -LiteralPath $AppPath -PathType Leaf) { $exePath = $AppPath }
    elseif (Test-Path -LiteralPath $AppPath -PathType Container) {
        $p = Join-Path $AppPath 'LC8172App.exe'
        if (Test-Path -LiteralPath $p) { $exePath = $p }
    }
}

if (-not $exePath) {
    $scriptDir = Split-Path -Parent $PSCommandPath
    $cwd = (Get-Location).Path
    $desktop = [Environment]::GetFolderPath('Desktop')
    $userProfile = [Environment]::GetFolderPath('UserProfile')
    $downloads = if ($userProfile) { Join-Path $userProfile 'Downloads' } else { '' }

    $candidatePaths = New-Object System.Collections.Generic.List[string]
    if ($scriptDir) { $candidatePaths.Add((Join-Path $scriptDir 'LC8172App.exe')) }
    if ($cwd) { $candidatePaths.Add((Join-Path $cwd 'LC8172App.exe')) }
    if ($desktop) { $candidatePaths.Add((Join-Path $desktop 'LC8172App.exe')) }
    if ($downloads) { $candidatePaths.Add((Join-Path $downloads 'LC8172App.exe')) }
    $candidatePaths.Add('C:\上位机\LC8172App.exe')
    $candidatePaths.Add('D:\上位机\LC8172App.exe')
    $candidatePaths.Add('C:\Program Files\LC8172App\LC8172App.exe')
    $candidatePaths.Add('D:\Program Files\LC8172App\LC8172App.exe')

    $fixedCandidates = @($candidatePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique)

    if (@($fixedCandidates).Count -gt 0) {
        $exePath = [string]@($fixedCandidates)[0]
        Add-Line ('  固定位置找到: ' + $exePath)
    } else {
        Add-Line '  固定位置未找到，开始有限深度搜索（桌面 / 上位机目录 / 脚本目录）...'
        $searchRoots = @($desktop, 'C:\上位机', 'D:\上位机', $scriptDir) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
        $found = @()
        foreach ($r in $searchRoots) {
            $found += Get-ChildItem -LiteralPath $r -Filter 'LC8172App.exe' -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.FullName }
        }
        $found = $found | Select-Object -Unique
        if ($found) {
            Add-Line ('  找到 ' + @($found).Count + ' 个，使用第一个:')
            $found | ForEach-Object { Add-Line ('    ' + $_) }
            $exePath = $found[0]
        }
    }
}

if (-not $exePath) {
    Add-Line '  未找到 LC8172App.exe！'
    Add-Line '  请重新运行并指定 -AppPath 参数（例如 -AppPath "D:\上位机\LC8172App.exe"）'
    Add-Line '  其余系统信息仍会继续收集。'
} else {
    Add-Line ('  使用程序   : ' + $exePath)
    try {
        $fi = Get-Item -LiteralPath $exePath
        $vi = $fi.VersionInfo
        $hash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash
        Add-Line ('  文件大小   : ' + [math]::Round($fi.Length / 1MB, 1) + ' MB')
        Add-Line ('  文件版本   : ' + $vi.FileVersion + '  (产品 ' + $vi.ProductVersion + ')')
        Add-Line ('  修改时间   : ' + $fi.LastWriteTime)
        Add-Line ('  SHA256     : ' + $hash)
    } catch {
        Add-Line ('  读取 exe 信息失败: ' + $_.Exception.Message)
    }

    # ============ 4. 程序目录内容 ============
    Add-Section '4. 程序目录内容（检查是否有旧版残留文件）'
    $appDir = Split-Path -Parent $exePath
    Add-Line ('  目录: ' + $appDir)
    Add-Line '  文件列表:'
    Get-ChildItem -LiteralPath $appDir -Force -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
        $len = if ($_.PSObject.Properties['Length']) { $_.Length } else { 0 }
        $ver = ''
        try { $ver = $_.VersionInfo.FileVersion } catch { }
        Add-Line ("    {0,-42} {1,10}  {2}  {3}" -f $_.Name, $len, $_.LastWriteTime, $ver)
    }

    Add-Line ''
    Add-Line '  关键残留检查（单文件发布目录中不应出现以下文件）:'
    $staleFiles = @('System.Private.CoreLib.dll', 'coreclr.dll', 'hostfxr.dll', 'hostpolicy.dll', 'clrjit.dll', 'System.Runtime.dll', 'LC8172App.runtimeconfig.json')
    foreach ($name in $staleFiles) {
        $p = Join-Path $appDir $name
        if (Test-Path -LiteralPath $p) {
            $f = Get-Item -LiteralPath $p
            Add-Line ("    发现残留: {0}  ({1} bytes, {2})  <-- 重点关注" -f $name, $f.Length, $f.LastWriteTime)
        } else {
            Add-Line ("    正常     : {0} 不存在" -f $name)
        }
    }

    # ============ 5. 程序日志 ============
    Add-Section '5. 程序自身日志'
    $appLogs = Join-Path $appDir 'logs'
    if (Test-Path -LiteralPath $appLogs) {
        $files = Get-ChildItem -LiteralPath $appLogs -File -ErrorAction SilentlyContinue
        Add-Line ('  找到日志文件 ' + @($files).Count + ' 个:')
        $files | Sort-Object LastWriteTime -Descending | Select-Object -First 20 | ForEach-Object {
            Add-Line ("    {0,-32} {1,8}  {2}" -f $_.Name, $_.Length, $_.LastWriteTime)
        }
        try {
            Copy-Item -LiteralPath $appLogs -Destination $logOut -Recurse -Force -ErrorAction Stop
            Add-Line '  日志已复制到结果包 App-Logs 目录。'
        } catch {
            Add-Line ('  日志复制失败（可能被占用）: ' + $_.Exception.Message)
        }
    } else {
        Add-Line '  程序目录下没有 logs 目录（说明 CLR 可能还没跑到写日志阶段，或程序从没成功启动过）。'
        Add-Line '  另外检查用户目录:'
        $userDirs = New-Object System.Collections.Generic.List[string]
        if ($env:LOCALAPPDATA) { $userDirs.Add((Join-Path $env:LOCALAPPDATA 'LC8172App')) }
        if ($env:APPDATA) { $userDirs.Add((Join-Path $env:APPDATA 'LC8172App')) }
        foreach ($p in $userDirs) {
            if (Test-Path -LiteralPath $p) {
                Add-Line ('    存在: ' + $p)
                Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | ForEach-Object { Add-Line ("      " + $_.Name + "  " + $_.Length + "  " + $_.LastWriteTime) }
            } else {
                Add-Line ('    不存在: ' + $p)
            }
        }
    }
}

# ============ 6. 事件日志（.NET Runtime + WER） ============
Add-Section '6. 事件日志'

function Get-AppEvents {
    param([int[]]$ids, [string]$match, [int]$max = 3000)
    try {
        $f = @{ LogName = 'Application'; Id = $ids }
        $evts = @(Get-WinEvent -FilterHashtable $f -MaxEvents $max -ErrorAction Stop)
        if ($match) {
            return @($evts | Where-Object { $_.Message -like "*$match*" })
        }
        return $evts
    } catch {
        return @()
    }
}

function Format-Events($evts) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($e in $evts) {
        [void]$sb.AppendLine('---')
        [void]$sb.AppendLine('[' + $e.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') + '] Id=' + $e.Id + ' Provider=' + $e.ProviderName + ' Level=' + $e.LevelDisplayName)
        [void]$sb.AppendLine($e.Message)
        [void]$sb.AppendLine('')
    }
    return $sb.ToString()
}

Add-Line '  6.1 .NET Runtime 致命错误事件 (Id=1023) —— 全部保留，这是最重要的证据'
$e1023 = Get-AppEvents -ids 1023 -match '' -max 500
if ($e1023) {
    Add-Line ('    共 ' + @($e1023).Count + ' 条:')
    $e1023 | Select-Object -First 30 | ForEach-Object {
        $first = ($_.Message -split "`r?`n" | Where-Object { $_ } | Select-Object -First 3) -join ' | '
        Add-Line ('    [' + $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') + '] ' + $first)
    }
} else {
    Add-Line '    没有找到 1023 事件。'
}

Add-Line ''
Add-Line '  6.2 与 LC8172App 相关的 .NET Runtime 异常事件 (Id=1026)'
$e1026 = Get-AppEvents -ids 1026 -match 'LC8172App' -max 3000
if ($e1026) {
    Add-Line ('    共 ' + @($e1026).Count + ' 条:')
} else {
    Add-Line '    没有找到。'
}

Add-Line ''
Add-Line '  6.3 与 LC8172App 相关的 WER 崩溃事件 (Id=1001)'
$e1001 = Get-AppEvents -ids 1001 -match 'LC8172App' -max 3000
if ($e1001) {
    Add-Line ('    共 ' + @($e1001).Count + ' 条:')
} else {
    Add-Line '    没有找到。'
}

Add-Line ''
Add-Line '  6.4 任何进程的 0x80131506 崩溃事件（用于判断是否“所有 .NET 10 程序都崩”）'
$e31506 = Get-AppEvents -ids 1001, 1023, 1026 -match '80131506' -max 3000
if ($e31506) {
    Add-Line ('    共 ' + @($e31506).Count + ' 条:')
    $e31506 | Select-Object -First 30 | ForEach-Object {
        $first = ($_.Message -split "`r?`n" | Where-Object { $_ } | Select-Object -First 4) -join ' | '
        Add-Line ('    [' + $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') + '] ' + $first)
    }
} else {
    Add-Line '    没有找到。'
}

try {
    $allEvents = @($e1023) + @($e1026) + @($e1001) + @($e31506) | Sort-Object TimeCreated -Unique
    $evtText = Format-Events $allEvents
    [System.IO.File]::WriteAllText((Join-Path $outRoot 'eventlog-application.txt'), $evtText, [System.Text.Encoding]::UTF8)
    Add-Line ''
    Add-Line '  完整事件内容已写入 eventlog-application.txt。'
} catch {
    Add-Line ('  事件日志写出失败: ' + $_.Exception.Message)
}

# ============ 7. WER 报告文件 ============
Add-Section '7. WER 崩溃报告文件'
$werRoots = @(
    'C:\ProgramData\Microsoft\Windows\WER\ReportArchive',
    'C:\ProgramData\Microsoft\Windows\WER\ReportQueue'
)
$copiedWer = 0
foreach ($root in $werRoots) {
    Add-Line ('  检查目录: ' + $root)
    if (-not (Test-Path -LiteralPath $root)) {
        Add-Line '    目录不存在。'
        continue
    }
    try {
        $dirs = @(Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction Stop)
    } catch {
        Add-Line ('    读取失败（可能需要管理员权限）: ' + $_.Exception.Message)
        continue
    }

    $targets = @($dirs | Where-Object { $_.Name -like '*LC8172App*' })
    Add-Line ('    共 ' + $dirs.Count + ' 个报告目录，其中 LC8172App 相关 ' + @($targets).Count + ' 个')

    # 额外扫描：Report.wer 中出现 80131506 的报告（不限程序名）
    Add-Line '    扫描包含 80131506 异常码的报告（不限程序名）...'
    foreach ($d in $dirs) {
        $werFile = Join-Path $d.FullName 'Report.wer'
        if (Test-Path -LiteralPath $werFile) {
            try {
                $hit = Select-String -LiteralPath $werFile -Pattern '80131506' -SimpleMatch -Quiet -ErrorAction Stop
                if ($hit) { $targets += $d }
            } catch { }
        }
    }
    $targets = $targets | Select-Object -Unique

    foreach ($d in $targets) {
        try {
            $dest = Join-Path $werOut ($d.Parent.Name + '__' + $d.Name)
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            $files = Get-ChildItem -LiteralPath $d.FullName -File -Force -ErrorAction Stop
            foreach ($f in $files) {
                $skipDump = ($f.Extension -eq '.dmp' -and -not $IncludeDumps)
                if ($skipDump) { continue }
                Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dest $f.Name) -Force -ErrorAction Stop
                $copiedWer++
            }
            Add-Line ('    已复制: ' + $d.Name + '  (' + @($files).Count + ' 个文件)')
        } catch {
            Add-Line ('    复制失败: ' + $d.Name + ' -> ' + $_.Exception.Message)
        }
    }
}
Add-Line ('  共复制 ' + $copiedWer + ' 个 WER 文件。')

# ============ 8. 本地崩溃转储 ============
Add-Section '8. 本地崩溃转储 (.dmp)'
$dumpRoots = @(
    "$env:LOCALAPPDATA\CrashDumps",
    'C:\ProgramData\Microsoft\Windows\WER\LocalDumps'
)
$foundDumps = @()
foreach ($root in $dumpRoots) {
    if (Test-Path -LiteralPath $root) {
        Add-Line ('  检查: ' + $root)
        $foundDumps += @(Get-ChildItem -LiteralPath $root -Filter 'LC8172App*.dmp' -File -ErrorAction SilentlyContinue)
        $foundDumps += @(Get-ChildItem -LiteralPath $root -Filter '*.dmp' -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-30) })
    } else {
        Add-Line ('  不存在: ' + $root)
    }
}
$foundDumps = $foundDumps | Sort-Object LastWriteTime -Descending | Select-Object -Unique
if ($foundDumps) {
    Add-Line ('  找到 ' + @($foundDumps).Count + ' 个 dump:')
    foreach ($d in $foundDumps) {
        $sizeMB = [math]::Round($d.Length / 1MB, 1)
        Add-Line ("    {0}  ({1} MB, {2})" -f $d.FullName, $sizeMB, $d.LastWriteTime)
        if ($IncludeDumps) {
            try {
                Copy-Item -LiteralPath $d.FullName -Destination (Join-Path $dumpOut $d.Name) -Force
                Add-Line '    已复制到结果包。'
            } catch {
                Add-Line ('    复制失败: ' + $_.Exception.Message)
            }
        }
    }
} else {
    Add-Line '  未找到 dump 文件。'
}

# ============ 9. 已安装软件（VC++ 运行库 / .NET） ============
Add-Section '9. 已安装的 VC++ 运行库 / .NET 运行时'
Add-Line '  9.1 Visual C++ Redistributable:'
$uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$vc = @()
foreach ($r in $uninstallRoots) {
    $vc += @(Get-ItemProperty $r -ErrorAction SilentlyContinue | Where-Object {
        $_.PSObject.Properties['DisplayName'] -and ($_.DisplayName -like '*Visual C++*' -or $_.DisplayName -like '*Microsoft C++*')
    })
}
if ($vc) {
    $vc | Select-Object DisplayName, DisplayVersion | Sort-Object DisplayName -Unique | ForEach-Object {
        Add-Line ('    ' + $_.DisplayName + '  ' + $_.DisplayVersion)
    }
} else {
    Add-Line '    未检测到任何 VC++ 运行库  <-- 重点关注（.NET 自包含程序仍依赖 VC++ 运行库）'
}

try {
    $vcx64 = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64' -ErrorAction SilentlyContinue
    if ($vcx64) {
        Add-Line ('    VC++ x64 运行时版本: Major=' + $vcx64.Major + ' Minor=' + $vcx64.Minor + ' Bld=' + $vcx64.Bld + ' RBld=' + $vcx64.RBld + '  Installed=' + $vcx64.Installed)
    }
} catch { }

Add-Line ''
Add-Line '  9.2 .NET 运行时（dotnet --list-runtimes）:'
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnet) {
    try {
        $output = & dotnet --list-runtimes 2>&1 | Out-String
        $output.Trim() -split "`r?`n" | ForEach-Object { Add-Line ('    ' + $_) }
    } catch {
        Add-Line ('    执行失败: ' + $_.Exception.Message)
    }
} else {
    Add-Line '    系统中没有 dotnet 命令（自包含程序不要求安装 .NET，此项仅供参考）。'
}

# ============ 10. WER / LocalDumps 注册表设置 ============
Add-Section '10. WER 相关注册表设置'
$werKey = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'
try {
    Add-Line '  HKLM\...\Windows Error Reporting:'
    $werProps = Get-ItemProperty $werKey -ErrorAction Stop
    foreach ($prop in $werProps.PSObject.Properties) {
        if ($prop.Name -notlike 'PS*') { Add-Line ('    ' + $prop.Name + ' = ' + $prop.Value) }
    }
} catch {
    Add-Line ('    读取失败: ' + $_.Exception.Message)
}

Add-Line ''
Add-Line '  HKLM\...\Windows Error Reporting\LocalDumps 下的程序级设置:'
$ldRoot = Join-Path $werKey 'LocalDumps'
if (Test-Path $ldRoot) {
    foreach ($sub in Get-ChildItem $ldRoot -ErrorAction SilentlyContinue) {
        Add-Line ('    [' + $sub.PSChildName + ']')
        $subProps = Get-ItemProperty $sub.PSPath -ErrorAction SilentlyContinue
        if ($subProps) {
            foreach ($prop in $subProps.PSObject.Properties) {
                if ($prop.Name -notlike 'PS*') { Add-Line ('      ' + $prop.Name + ' = ' + $prop.Value) }
            }
        }
    }
} else {
    Add-Line '    没有 LocalDumps 设置。'
}

# ============ 11. 最近的 Windows 更新 ============
Add-Section '11. 最近的 Windows 更新补丁 (最多 30 条)'
try {
    $hf = @(Get-HotFix -ErrorAction Stop | Sort-Object InstalledOn -Descending | Select-Object -First 30)
    if ($hf) {
        $hf | ForEach-Object {
            Add-Line ('    ' + $_.HotFixID + '  ' + $_.Description + '  ' + $_.InstalledOn)
        }
    } else {
        Add-Line '    没有查询到补丁记录。'
    }
} catch {
    Add-Line ('    查询失败: ' + $_.Exception.Message)
}

# ============ 12. 可选：开启 LocalDumps ============
if ($EnableLocalDumps) {
    Add-Section '12. 已开启 LC8172App 本地崩溃转储'
    try {
        $dumpReg = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\LC8172App.exe'
        $dumpFolder = 'C:\ProgramData\Microsoft\Windows\WER\LocalDumps\LC8172App'
        New-Item -Path $dumpFolder -ItemType Directory -Force -ErrorAction Stop | Out-Null
        New-Item -Path $dumpReg -ItemType Directory -Force -ErrorAction Stop | Out-Null
        Set-ItemProperty -Path $dumpReg -Name 'DumpFolder' -Value $dumpFolder -Type ExpandString -ErrorAction Stop
        Set-ItemProperty -Path $dumpReg -Name 'DumpType' -Value 2 -Type DWord -ErrorAction Stop   # 2 = 完整转储
        Set-ItemProperty -Path $dumpReg -Name 'DumpCount' -Value 5 -Type DWord -ErrorAction Stop
        Add-Line ('  已设置: DumpFolder=' + $dumpFolder + '  DumpType=2(完整)  DumpCount=5')
        Add-Line '  下次 LC8172App 崩溃时会在上述目录留下 .dmp，之后重新运行本脚本即可收集。'
    } catch {
        Add-Line ('  设置失败（需要管理员权限）: ' + $_.Exception.Message)
    }
}

# ============ 保存与打包 ============
$reportFile = Join-Path $outRoot 'crash-info.txt'
Save-Report $reportFile

Write-Host ''
Write-Host ('已生成信息文件: ' + $reportFile) -ForegroundColor Green

$zipPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "LC8172CrashInfo-$env:COMPUTERNAME-$stamp.zip"
try {
    Compress-Archive -Path (Join-Path $outRoot '*') -DestinationPath $zipPath -Force -ErrorAction Stop
    Write-Host ''
    Write-Host ('打包完成: ' + $zipPath) -ForegroundColor Green
    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host ('压缩包大小: ' + $zipSize + ' MB') -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host ('压缩失败，请直接发送整个目录: ' + $outRoot) -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ''
Write-Host '收集完成。请把 zip 文件发回分析。' -ForegroundColor Cyan
Write-Host ''
