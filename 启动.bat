@echo off
title AI环境管理工具 - 启动器
color 0B
setlocal

echo.
echo =====================================
echo       AI环境管理工具 - 启动器
echo       作者: B站Dontdrunk
echo =====================================
echo.

echo [选项菜单]
echo.
echo  [1] 启动程序 - 启动AI环境管理工具
echo  [2] 检查环境 - 检测并安装必要的Python依赖
echo  [3] 软件介绍 - 查看软件功能和使用方法
echo  [4] 退出软件 - 退出启动器
echo.
echo =====================================
echo.

set /p "UserChoice=请输入选项 [1-4]: "
echo.

if "%UserChoice%"=="1" goto StartApplication
if "%UserChoice%"=="2" goto CheckEnvironment
if "%UserChoice%"=="3" goto ShowIntroduction
if "%UserChoice%"=="4" goto ExitApplication

echo 无效的选择，请输入1-4之间的数字
timeout /t 2 >nul
goto ShowMenu

:CheckPythonInstalled
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo 错误: 未检测到Python安装。请安装Python 3.7+后重试。
        echo 按任意键退出...
        pause >nul
        exit /b 1
    )
    
    python -c "print('Python找到了')" >nul 2>nul
    if %errorlevel% neq 0 (
        echo 错误: Python无法正常运行，请检查安装。
        echo 按任意键退出...
        pause >nul
        exit /b 1
    )
    
    goto :EOF

:StartApplication
    echo 正在启动AI环境管理工具，请稍候...
    echo.
    
    :: 检查Python是否安装
    call :CheckPythonInstalled
    if %errorlevel% neq 0 exit /b
    
    echo 初始化程序组件...
    
    :: 检查main.py是否存在
    if not exist "main.py" (
        echo 错误: main.py文件不存在，请确保在正确目录下运行。
        echo 当前目录: %CD%
        pause
        exit /b 1
    )
    
    :: 修改后的端口检测逻辑：只检测LISTENING状态的端口
    netstat -ano | findstr ":8282.*LISTENING" >nul
    if %errorlevel% equ 0 (
        echo 警告: 端口8282已被占用，可能是程序已经在运行。
        echo 如需重启，请先关闭已运行的实例。
        pause
        exit /b
    )
    
    :: 在后台启动浏览器（不等待其关闭）
    echo 正在启动浏览器，请稍候...
    start "" http://127.0.0.1:8282
    
    :: 直接在当前窗口运行Python程序
    echo 正在启动服务，按Ctrl+C可以停止服务...
    echo ---------------------------------------------------------------
    
    :: 运行Python程序并等待其完成 - 不使用start命令
    python main.py
    
    :: Python程序结束后返回主菜单
    echo.
    echo ---------------------------------------------------------------
    echo 服务已停止。按任意键返回主菜单...
    pause >nul
    goto ShowMenu

:CheckEnvironment
    echo 环境检查和依赖安装
    echo.
    
    :: 检查Python是否安装
    call :CheckPythonInstalled
    if %errorlevel% neq 0 exit /b
    
    echo ✓ 已检测到Python安装
    
    :: 检查pip
    echo 正在检查pip...
    python -m pip --version >nul 2>nul
    if %errorlevel% neq 0 (
        echo 未检测到pip。正在尝试安装...
        python -m ensurepip
        if %errorlevel% neq 0 (
            echo 安装pip失败。请手动安装pip后重试。
            pause
            goto :EOF
        )
    )
    echo ✓ pip已安装
    
    :: 更新pip
    echo 正在更新pip到最新版本...
    python -m pip install --upgrade pip >nul 2>nul
    echo ✓ pip已更新到最新版本
    
    :: 检查并安装必要的依赖
    echo 正在检查和安装必要的依赖...
    echo.
    
    echo 安装flask...
    python -m pip install flask
    echo 安装flask-cors...
    python -m pip install flask-cors
    echo 安装requests...
    python -m pip install requests
    echo 安装packaging...
    python -m pip install packaging
    
    python -c "import sys; print(sys.version_info < (3,8))" | findstr "True" >nul
    if %errorlevel% equ 0 (
        echo 检测到Python版本低于3.8，安装兼容性依赖...
        python -m pip install importlib-metadata
    )
    
    echo.
    echo 环境检查完成！所有必要的依赖已安装。
    echo 按任意键返回...
    pause >nul
    goto ShowMenu

:ShowIntroduction
    echo AI环境管理工具 - 软件介绍
    echo.
    echo 这是一个用于管理Python AI开发环境的工具，提供直观的Web界面，帮助您：
    echo.
    echo • 查看已安装的Python依赖包
    echo • 一键安装、更新和卸载依赖
    echo • 切换依赖的特定版本
    echo • 批量管理多个依赖
    echo • 搜索和筛选依赖
    echo • 上传wheel文件或requirements.txt进行安装
    echo.
    echo 主要功能：
    echo 1. 全面的依赖概览 - 清晰展示依赖信息，标记系统和应用依赖
    echo 2. 高效的依赖管理 - 安装、更新、卸载和版本切换
    echo 3. 优化的用户体验 - 搜索、筛选和主题切换
    echo.
    echo 使用方法：
    echo 1. 从主菜单选择"启动程序"
    echo 2. 浏览器会自动打开Web界面
    echo 3. 或手动访问 http://127.0.0.1:8282
    echo.
    echo 开发者：B站Dontdrunk
    echo.
    echo 按任意键返回...
    pause >nul
    goto ShowMenu

:ExitApplication
    echo 正在退出AI环境管理工具...
    echo.
    
    :: 检查是否有运行中的程序实例并关闭
    tasklist /fi "imagename eq python.exe" | find "python.exe" >nul
    if %errorlevel% equ 0 (
        echo 检测到运行中的Python实例，正在尝试关闭...
        taskkill /f /im python.exe /fi "windowtitle eq AI*" >nul 2>nul
        if %errorlevel% equ 0 (
            echo ✓ 已关闭运行中的程序实例
        ) else (
            echo × 无法关闭程序实例
        )
    )
    
    echo.
    echo 感谢使用AI环境管理工具！
    echo 再见！
    
    timeout /t 3 >nul
    exit /b 0

:: 主程序入口
:ShowMenu
    cls
    echo.
    echo =====================================
    echo       AI环境管理工具 - 启动器
    echo       作者: B站Dontdrunk
    echo =====================================
    echo.

    echo [选项菜单]
    echo.
    echo  [1] 启动程序 - 启动AI环境管理工具
    echo  [2] 检查环境 - 检测并安装必要的Python依赖
    echo  [3] 软件介绍 - 查看软件功能和使用方法
    echo  [4] 退出软件 - 退出启动器
    echo.
    echo =====================================
    echo.

    set /p "UserChoice=请输入选项 [1-4]: "
    echo.

    if "%UserChoice%"=="1" goto StartApplication
    if "%UserChoice%"=="2" goto CheckEnvironment
    if "%UserChoice%"=="3" goto ShowIntroduction
    if "%UserChoice%"=="4" goto ExitApplication

    echo 无效的选择，请输入1-4之间的数字
    timeout /t 2 >nul
    goto ShowMenu

:: 启动主程序
call :ShowMenu
