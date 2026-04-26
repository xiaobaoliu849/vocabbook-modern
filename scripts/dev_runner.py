import subprocess
import time
import sys
import os
import socket

# Configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
CLOUD_DIR = os.path.join(PROJECT_ROOT, 'cloud_server')
FRONTEND_DIR = os.path.join(PROJECT_ROOT, 'frontend')
ELECTRON_DIR = os.path.join(PROJECT_ROOT, 'electron')
DEFAULT_CLOUD_API_URL = 'https://api.historyai.fun'
PYTHON_BIN = sys.executable
NEW_CONSOLE = getattr(subprocess, 'CREATE_NEW_CONSOLE', 0)

def main():
    print(f'Starting VocabBook Modern from {PROJECT_ROOT}...')
    shared_env = os.environ.copy()
    shared_env.setdefault('VOCABBOOK_CLOUD_API_URL', DEFAULT_CLOUD_API_URL)
    shared_env.setdefault('VITE_CLOUD_API_URL', DEFAULT_CLOUD_API_URL)
    start_local_cloud = str(shared_env.get('START_LOCAL_CLOUD', 'false')).strip().lower() == 'true'

    # 1. Start Backend
    print('Starting Backend...')
    backend_cmd = [PYTHON_BIN, '-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000']
    backend_process = subprocess.Popen(backend_cmd, cwd=BACKEND_DIR, env=shared_env, creationflags=NEW_CONSOLE)

    # 2. Start Cloud Server
    cloud_process = None
    if start_local_cloud:
        print('Starting Cloud Server...')
        cloud_cmd = [PYTHON_BIN, 'main.py']
        cloud_process = subprocess.Popen(cloud_cmd, cwd=CLOUD_DIR, env=shared_env, creationflags=NEW_CONSOLE)
    else:
        print(f'Skipping local cloud server. Using remote cloud API: {shared_env["VITE_CLOUD_API_URL"]}')

    # 3. Start Frontend
    print('Starting Frontend...')
    frontend_cmd = ['npm', 'run', 'dev', '--', '--port', '5173', '--strictPort']
    frontend_process = subprocess.Popen(frontend_cmd, cwd=FRONTEND_DIR, shell=True, env=shared_env, creationflags=NEW_CONSOLE)

    # Wait for Vite dev server to be ready before launching Electron
    # Use raw socket (tries both IPv4 and IPv6) to avoid proxy/TUN interference
    print('Waiting for Vite dev server on port 5173...')
    max_wait = 60
    waited = 0
    vite_ready = False
    while waited < max_wait:
        for host in ('127.0.0.1', '::1'):
            try:
                family = socket.AF_INET6 if ':' in host else socket.AF_INET
                with socket.socket(family, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    s.connect((host, 5173))
                vite_ready = True
                break
            except Exception:
                pass
        if vite_ready:
            print(f'Vite is ready after {waited}s!')
            break
        time.sleep(2)
        waited += 2
    if not vite_ready:
        print(f'[WARNING] Vite did not respond within {max_wait}s, starting Electron anyway...')

    # 3. Start Electron
    print('Starting Electron...')
    electron_cmd = ['npm', 'start']
    env = shared_env.copy()
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
                if cloud_process is not None:
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(cloud_process.pid)])
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(frontend_process.pid)])
            else:
                backend_process.terminate()
                if cloud_process is not None:
                    cloud_process.terminate()
                frontend_process.terminate()
        except Exception as e:
            print(f'Error killing processes: {e}')
        print('All services stopped.')

if __name__ == '__main__':
    main()
