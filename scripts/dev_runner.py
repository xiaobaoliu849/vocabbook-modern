import subprocess
import time
import sys
import os
import shutil

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
CLOUD_DIR = os.path.join(PROJECT_ROOT, 'cloud_server')
FRONTEND_DIR = os.path.join(PROJECT_ROOT, 'frontend')
ELECTRON_DIR = os.path.join(PROJECT_ROOT, 'electron')

def main():
    print(f'Starting VocabBook Modern from {PROJECT_ROOT}...')

    # 1. Start Backend
    print('Starting Backend...')
    backend_cmd = ['python', '-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000']
    backend_process = subprocess.Popen(backend_cmd, cwd=BACKEND_DIR, creationflags=subprocess.CREATE_NEW_CONSOLE)

    # 2. Start Cloud Server
    print('Starting Cloud Server...')
    cloud_cmd = ['python', 'main.py']
    cloud_process = subprocess.Popen(cloud_cmd, cwd=CLOUD_DIR, creationflags=subprocess.CREATE_NEW_CONSOLE)

    # 3. Start Frontend
    print('Starting Frontend...')
    frontend_cmd = ['npm', 'run', 'dev']
    frontend_process = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)

    # Wait for services
    print('Waiting for services to initialize...')
    time.sleep(5)

    # 3. Start Electron
    print('Starting Electron...')
    electron_cmd = ['npm', 'start']
    env = os.environ.copy()
    env['NODE_ENV'] = 'development'
    
    electron_process = subprocess.Popen(electron_cmd, cwd=ELECTRON_DIR, shell=True, env=env)

    try:
        print('VocabBook is running. Close the Electron app to stop all services.')
        electron_process.wait()
    except KeyboardInterrupt:
        print('\nStopping services...')
    finally:
        print('Shutting down services...')
        try:
            if os.name == 'nt':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(backend_process.pid)])
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(cloud_process.pid)])
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(frontend_process.pid)])
            else:
                backend_process.terminate()
                cloud_process.terminate()
                frontend_process.terminate()
        except Exception as e:
            print(f'Error killing processes: {e}')
        print('All services stopped.')

if __name__ == '__main__':
    main()
