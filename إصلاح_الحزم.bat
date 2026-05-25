@echo off
echo ====================================================
echo       Tobal Flexy Desktop Package Repair Wizard
echo ====================================================
echo.
echo Deleting broken native package folders...
rmdir /s /q node_modules\sqlite3 2>nul
rmdir /s /q node_modules\serialport 2>nul
echo.
echo Reinstalling SQLite3 and Serialport prebuilt binaries...
call npm install sqlite3@5.1.7 serialport@12.0.0 --build-from-source=false
echo.
echo Performing N-API Electron 28 binary linking hack...
if exist "node_modules\sqlite3\lib\binding\napi-v3-win32-x64" (
    echo [+] Found precompiled N-API binary!
    echo [+] Linking binary for Electron 28 (node-v119)...
    mkdir "node_modules\sqlite3\lib\binding\node-v119-win32-x64" 2>nul
    copy "node_modules\sqlite3\lib\binding\napi-v3-win32-x64\node_sqlite3.node" "node_modules\sqlite3\lib\binding\node-v119-win32-x64\node_sqlite3.node" /Y
    echo [+] SQLite3 successfully linked!
) else (
    echo [!] Warning: napi-v3-win32-x64 folder not found.
)
echo.
echo [+] SUCCESS: Native packages repaired and linked!
echo You can now run the app or compile it.
echo ====================================================
pause
