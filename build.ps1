# ------------------------------------------------------------------------
# 名称：build.ps1
# 说明：运行扩展测试与编译，并打包生成 VSIX 安装文件。
# 作者：Lion
# 邮箱：chengbin@3578.cn
# 日期：2026-10-08
# 备注：需先安装 package.json 中声明的 npm 依赖。
# ------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot
try {
    npm run test
    if ($LASTEXITCODE -ne 0) {
        throw "扩展测试或编译失败，npm 退出码：$LASTEXITCODE"
    }

    npm run package
    if ($LASTEXITCODE -ne 0) {
        throw "VSIX 打包失败，npm 退出码：$LASTEXITCODE"
    }
}
finally {
    Pop-Location
}