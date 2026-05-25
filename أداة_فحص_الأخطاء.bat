@echo off
echo =========================================
echo  أداة فحص الأخطاء - يرجى الانتظار
echo =========================================
call npm start > error_log.txt 2>&1
echo تمت كتابة الأخطاء في ملف error_log.txt
pause
