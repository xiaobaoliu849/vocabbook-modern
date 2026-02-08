 @echo off
 echo Starting VocabBook Cloud Server...
 echo.
 
 cd /d "%~dp0cloud_server"
 python main.py
 
 echo.
 echo Server stopped.
 pause
