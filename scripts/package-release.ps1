$ErrorActionPreference='Stop'
$TaskProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$TaskOut=Join-Path $TaskProject 'releases'
$TaskVersion=(Get-Content -LiteralPath (Join-Path $TaskProject 'package.json') -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Path $TaskOut -Force | Out-Null
$TaskPortable=Join-Path $TaskOut ('Na-Economics-Lab-'+$TaskVersion+'-portable.zip')
$TaskSource=Join-Path $TaskOut ('Na-Economics-Lab-'+$TaskVersion+'-source.zip')
if((Test-Path -LiteralPath $TaskPortable) -or (Test-Path -LiteralPath $TaskSource)){throw '该版本发布包已存在；请先改变版本或选择新发布名称，保留历史包'}
$TaskStage=Join-Path $TaskOut ('stage-'+[guid]::NewGuid().ToString('N'))
$TaskPortableStage=Join-Path $TaskStage 'portable'
$TaskSourceStage=Join-Path $TaskStage 'source'
New-Item -ItemType Directory -Path $TaskPortableStage,$TaskSourceStage | Out-Null
try {
    foreach($TaskName in @('dist','data','evidence','tests','docs','output')){Copy-Item -LiteralPath (Join-Path $TaskProject $TaskName) -Destination $TaskPortableStage -Recurse}
    New-Item -ItemType Directory -Path (Join-Path $TaskPortableStage 'src'),(Join-Path $TaskPortableStage 'scripts') | Out-Null
    Copy-Item -LiteralPath (Join-Path $TaskProject 'src\model') -Destination (Join-Path $TaskPortableStage 'src') -Recurse
    Copy-Item -LiteralPath (Join-Path $TaskProject 'src\research') -Destination (Join-Path $TaskPortableStage 'src') -Recurse
    Copy-Item -LiteralPath (Join-Path $TaskProject 'src\cobuild') -Destination (Join-Path $TaskPortableStage 'src') -Recurse
    foreach($TaskName in @('serve.mjs','build-evidence.mjs','build-research.mjs','build-product-screening.mjs','build-cobuild-evidence.mjs','build-sprint-evidence.mjs','build-report.mjs')){Copy-Item -LiteralPath (Join-Path $TaskProject ('scripts\'+$TaskName)) -Destination (Join-Path $TaskPortableStage 'scripts')}
    foreach($TaskName in @('README.md','CONTRIBUTING.md','LICENSE','启动工具.cmd','THIRD-PARTY-NOTICES.txt')){Copy-Item -LiteralPath (Join-Path $TaskProject $TaskName) -Destination $TaskPortableStage}
    $TaskSourceNames=@('package.json','package-lock.json','index.html','vite.config.mjs','.gitignore','README.md','CONTRIBUTING.md','LICENSE','启动工具.cmd','THIRD-PARTY-NOTICES.txt','src','scripts','data','tests','docs','design','evidence','public','dist','output')
    foreach($TaskName in $TaskSourceNames){Copy-Item -LiteralPath (Join-Path $TaskProject $TaskName) -Destination $TaskSourceStage -Recurse}
    foreach($TaskBundleStage in @($TaskPortableStage,$TaskSourceStage)) {
        $TaskAssetsPath=Join-Path $TaskBundleStage 'dist/assets'
        $TaskAssetFiles=@(Get-ChildItem -LiteralPath $TaskAssetsPath -File | Where-Object {$_.Extension -in @('.js','.css')})
        $TaskKeepAssets=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        $TaskAssetQueue=[Collections.Generic.Queue[string]]::new()
        $TaskAssetQueue.Enqueue((Join-Path $TaskBundleStage 'dist/index.html'))
        while($TaskAssetQueue.Count -gt 0) {
            $TaskAssetText=[IO.File]::ReadAllText($TaskAssetQueue.Dequeue())
            foreach($TaskAssetFile in $TaskAssetFiles) {
                if($TaskAssetText.Contains($TaskAssetFile.Name) -and $TaskKeepAssets.Add($TaskAssetFile.Name)) {$TaskAssetQueue.Enqueue($TaskAssetFile.FullName)}
            }
        }
        if($TaskKeepAssets.Count -lt 4){throw '新版构建的资源依赖不完整，停止打包'}
        foreach($TaskAssetFile in $TaskAssetFiles) {
            if(!$TaskKeepAssets.Contains($TaskAssetFile.Name)) {
                $TaskAssetResolved=[IO.Path]::GetFullPath($TaskAssetFile.FullName)
                $TaskStagePrefix=[IO.Path]::GetFullPath($TaskBundleStage)+[IO.Path]::DirectorySeparatorChar
                if(!$TaskAssetResolved.StartsWith($TaskStagePrefix,[StringComparison]::OrdinalIgnoreCase)){throw '构建副本路径越界'}
                Remove-Item -LiteralPath $TaskAssetResolved -Force
            }
        }
    }
    Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $TaskPortableStage -Force | Select-Object -ExpandProperty FullName) -DestinationPath $TaskPortable
    Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $TaskSourceStage -Force | Select-Object -ExpandProperty FullName) -DestinationPath $TaskSource
    $TaskHashes=Get-FileHash -LiteralPath $TaskPortable,$TaskSource -Algorithm SHA256 | Select-Object @{Name='file';Expression={Split-Path -Leaf $_.Path}},Hash
    $TaskHashes | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $TaskOut ('SHA256-'+$TaskVersion+'.json')) -Encoding utf8
    $TaskHashes | ConvertTo-Json -Depth 4
} finally {
    $TaskResolvedStage=[IO.Path]::GetFullPath($TaskStage)
    $TaskResolvedOut=[IO.Path]::GetFullPath($TaskOut)+[IO.Path]::DirectorySeparatorChar
    if(!$TaskResolvedStage.StartsWith($TaskResolvedOut,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path -Leaf $TaskResolvedStage).StartsWith('stage-')){throw '打包临时目录不在预期范围内，停止清理'}
    Remove-Item -LiteralPath $TaskResolvedStage -Recurse -Force
}
