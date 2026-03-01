@echo off
 echo Starting VocabBook Modern (DEV MODE - Unified Runner)...
 echo.
 
 REM Run the Python script to manage all processes
 python "%~dp0scripts\dev_runner.py"
 
 echo.
 echo Exiting...
 pause
