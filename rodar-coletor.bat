@echo off
chcp 65001 >nul
title Home Office Hub - Coletor de Vagas
cd /d "%~dp0"

echo ============================================================
echo    HOME OFFICE HUB - Coletor de Vagas
echo ============================================================
echo.

REM ---- procura o Python instalado ----
set "PY="
py --version >nul 2>&1 && set "PY=py"
if not defined PY (
    python --version >nul 2>&1 && set "PY=python"
)

if not defined PY (
    echo [ERRO] Python nao encontrado neste computador.
    echo.
    echo Instale em: https://www.python.org/downloads/
    echo.
    echo IMPORTANTE: na PRIMEIRA tela do instalador, marque a caixinha
    echo "Add Python to PATH" antes de clicar em Install.
    echo Sem isso o Windows nao acha o Python e este erro volta.
    echo.
    pause
    exit /b 1
)

REM ---- confere se esta na pasta certa ----
if not exist "coletor.py" (
    echo [ERRO] Nao achei o arquivo coletor.py nesta pasta.
    echo.
    echo Este atalho precisa estar DENTRO da pasta do projeto,
    echo junto com o coletor.py e o vagas.json.
    echo.
    echo Pasta atual: %CD%
    echo.
    pause
    exit /b 1
)

echo Python encontrado:
%PY% --version
echo.

echo Preparando as bibliotecas necessarias...
%PY% -m pip install --quiet --upgrade certifi
echo.

echo ============================================================
echo    RODANDO O COLETOR
echo    Isso leva de 2 a 5 minutos. Nao feche a janela.
echo ============================================================
echo.

%PY% coletor.py

echo.
echo ============================================================
echo    TERMINOU
echo ============================================================
echo.
echo Confira acima se a micro1 trouxe vagas.
echo.
echo Agora suba no GitHub os arquivos que mudaram nesta pasta:
echo    - vagas.json
echo    - vagas_para_resumo.json
echo.
echo Se aparecer resumos.json alterado, suba ele tambem.
echo.
pause
