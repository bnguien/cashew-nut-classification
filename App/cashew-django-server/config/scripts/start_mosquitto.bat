@echo off
setlocal

echo ========================================
echo   Cashew - Start Mosquitto Broker
echo ========================================

set "MOSQ_EXE="

if exist "C:\Program Files\mosquitto\mosquitto.exe" (
    set "MOSQ_EXE=C:\Program Files\mosquitto\mosquitto.exe"
)

if not defined MOSQ_EXE (
    if exist "C:\Program Files (x86)\mosquitto\mosquitto.exe" (
        set "MOSQ_EXE=C:\Program Files (x86)\mosquitto\mosquitto.exe"
    )
)

if not defined MOSQ_EXE (
    echo [ERROR] Cannot find mosquitto.exe
    echo Please install Mosquitto first:
    echo https://mosquitto.org/download/
    pause
    exit /b 1
)

echo [INFO] Using: "%MOSQ_EXE%"
echo [INFO] Starting broker on default port 1883...
echo [INFO] Keep this window open while testing MQTT.
echo.

"%MOSQ_EXE%" -v

endlocal
