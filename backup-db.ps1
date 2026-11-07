# Backs up the SQLite database into backups\ (untracked).
# Uses SQLite's online backup API inside the running api container, so the copy
# is consistent even while the device is writing (the database is in WAL mode,
# so a plain file copy could miss recent writes). Needs the stack running.
$compose   = "$PSScriptRoot\docker-compose.yml"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$backupDir = "$PSScriptRoot\backups"
$backupDb  = "$backupDir\climate_iot_$timestamp.db"
$tmpDb     = "/tmp/climate_iot_backup.db"

New-Item -ItemType Directory -Force $backupDir | Out-Null

Write-Host "Backing up database from the api container..."
docker compose -f $compose exec -T api python -c "import sqlite3; s=sqlite3.connect('/data/climate_iot.db'); d=sqlite3.connect('$tmpDb'); s.backup(d); d.close(); s.close()"
if ($LASTEXITCODE -ne 0) { Write-Error "Backup failed. Is the stack running? (docker compose up -d)"; exit 1 }
docker compose -f $compose cp "api:$tmpDb" $backupDb
if ($LASTEXITCODE -ne 0) { Write-Error "Copying the backup out of the container failed."; exit 1 }
docker compose -f $compose exec -T api rm -f $tmpDb

Write-Host "Backup:   $backupDb"
Write-Host "Done."
