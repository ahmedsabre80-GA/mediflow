@echo off
start "Patient   :3000" cmd /k "cd /d D:\mediflow\apps\web-patient && npm run dev"
start "Doctor    :3003" cmd /k "cd /d D:\mediflow\apps\web-doctor && npm run dev"
start "Pharmacy  :3001" cmd /k "cd /d D:\mediflow\apps\web-pharmacy && npm run dev"
start "Admin     :3002" cmd /k "cd /d D:\mediflow\apps\web-admin && npm run dev"
start "Warehouse :3004" cmd /k "cd /d D:\mediflow\apps\web-warehouse && npm run dev"
