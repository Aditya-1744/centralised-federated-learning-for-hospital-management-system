$ErrorActionPreference = "Stop"

Write-Host "Starting Centralized Federated Learning..."

# Start FL Server
Write-Host "Starting FL Server..."
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"cd backend; .\venv\Scripts\Activate.ps1; python server/fl_server.py --rounds 3 --min_clients 3 --proximal_mu 0.1`""

Start-Sleep -Seconds 2

# Start Hospital Nodes
Write-Host "Starting Hospital Nodes..."
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"cd backend; .\venv\Scripts\Activate.ps1; python client/hospital_node.py --hospitalid 6 --server_address localhost:8443`""
Start-Sleep -Seconds 2
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"cd backend; .\venv\Scripts\Activate.ps1; python client/hospital_node.py --hospitalid 12 --server_address localhost:8443`""
Start-Sleep -Seconds 2
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"cd backend; .\venv\Scripts\Activate.ps1; python client/hospital_node.py --hospitalid 19 --server_address localhost:8443`""
Start-Sleep -Seconds 2

# Start API
Write-Host "Starting API..."
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"`$env:FL_DASHBOARD_FRONTEND_ORIGIN='http://localhost:3000'; `$env:FL_DASHBOARD_JWT_SECRET='dev-only-insecure-secret-change-me'; `$env:FL_DASHBOARD_USER='admin'; `$env:FL_DASHBOARD_PASSWORD='changeme'; cd backend; .\venv\Scripts\Activate.ps1; cd api; uvicorn main:app --host 0.0.0.0 --port 8000`""
Start-Sleep -Seconds 2

# Start Frontend
Write-Host "Starting Frontend..."
Start-Process powershell -WorkingDirectory $PSScriptRoot -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"cd frontend; npm run dev`""

Write-Host "All services started! You can close this window now."
