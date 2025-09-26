#!/usr/bin/env pwsh

# Simple Docker management script with minimal features

param (
    [string]$Command,
    [string]$Service,
    [switch]$Tools
)

function Start-Docker {
    Write-Host "Starting Casino Club F2P services..." -ForegroundColor Cyan
    
    # Run commands based on whether tools are included
    if ($Tools) {
        Write-Host "Starting with development tools..." -ForegroundColor Cyan
    docker-compose -f docker-compose.yml up -d backend frontend postgres pgadmin
        Write-Host "All services and development tools started!" -ForegroundColor Green
    } else {
    docker-compose -f docker-compose.yml up -d backend frontend postgres
        Write-Host "Basic services started! (excluding development tools)" -ForegroundColor Green
    }
    
    # Output service URLs
    Write-Host "`nService URLs:" -ForegroundColor Yellow
    Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
    Write-Host "   Backend API: http://localhost:8000" -ForegroundColor White
    Write-Host "   API Documentation: http://localhost:8000/docs" -ForegroundColor White
    
    if ($Tools) {
        Write-Host "   pgAdmin: http://localhost:5050" -ForegroundColor White
        Write-Host "     Email: admin@casino-club.local" -ForegroundColor Gray
        Write-Host "     Password: admin123" -ForegroundColor Gray
    }
}

function Stop-Docker {
    Write-Host "Stopping Casino Club F2P services..." -ForegroundColor Cyan
    docker-compose -f docker-compose.yml down
    Write-Host "All services stopped!" -ForegroundColor Green
}

function Show-Status {
    Write-Host "Casino Club F2P service status:" -ForegroundColor Cyan
    docker-compose -f docker-compose.yml ps
}

function Show-Logs {
    if ($Service) {
        Write-Host "Showing logs for $Service service..." -ForegroundColor Cyan
    docker-compose -f docker-compose.yml logs --tail=100 -f $Service
    } else {
        Write-Host "Showing logs for all services..." -ForegroundColor Cyan
    docker-compose -f docker-compose.yml logs --tail=50 -f
    }
}

function Enter-Shell {
    if (-not $Service) {
        Write-Host "Please specify a service name (e.g., ./docker-manage-simple.ps1 shell backend)" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Connecting to shell for $Service service..." -ForegroundColor Cyan
    if ($Service -eq "backend") {
    docker-compose -f docker-compose.yml exec backend /bin/bash
    } elseif ($Service -eq "frontend") {
    docker-compose -f docker-compose.yml exec frontend /bin/bash
    } else {
        Write-Host "Unsupported service: $Service" -ForegroundColor Red
        exit 1
    }
}

function Initialize-Database {
    Write-Host "Initializing database..." -ForegroundColor Cyan
    docker-compose -f docker-compose.yml exec backend python init_simple_db.py
    Write-Host "Database initialization complete!" -ForegroundColor Green
}

function Show-Help {
    Write-Host "Casino Club F2P Simplified Version Docker Management Script Usage" -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Gray
    Write-Host "start    [--tools]    - Start services (--tools: include dev tools)" -ForegroundColor White
    Write-Host "stop                  - Stop services" -ForegroundColor White
    Write-Host "status                - Check service status" -ForegroundColor White
    Write-Host "logs     [service]    - View logs (all logs if service omitted)" -ForegroundColor White
    Write-Host "shell    <service>    - Connect to service container shell" -ForegroundColor White
    Write-Host "init-db               - Initialize database (includes test data)" -ForegroundColor White
    Write-Host "help                  - Show this help" -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Gray
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  ./docker-manage-simple.ps1 start --tools" -ForegroundColor Gray
    Write-Host "  ./docker-manage-simple.ps1 shell backend" -ForegroundColor Gray
    Write-Host "  ./docker-manage-simple.ps1 logs frontend" -ForegroundColor Gray
}

# Execute command
switch ($Command) {
    "start" { Start-Docker }
    "stop" { Stop-Docker }
    "status" { Show-Status }
    "logs" { Show-Logs }
    "shell" { Enter-Shell }
    "init-db" { Initialize-Database }
    "help" { Show-Help }
    default { Show-Help }
}
