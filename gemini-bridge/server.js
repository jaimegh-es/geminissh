const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const { Client } = require('ssh2');
const os = require('os');
const events = require('events');

const PORT = 3456;
// Usamos una ruta global para las configuraciones
const GLOBAL_DIR = path.join(os.homedir(), '.gemini-bridge');
const CONFIGS_DIR = path.join(GLOBAL_DIR, 'configs');
const SETTINGS_FILE = path.join(GLOBAL_DIR, 'settings.json');

if (!fs.existsSync(CONFIGS_DIR)) fs.mkdirSync(CONFIGS_DIR, { recursive: true });

// Cargar configuración inicial
let globalSettings = { intercept_terminal: false };
if (fs.existsSync(SETTINGS_FILE)) {
    try { globalSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch(e) {}
}

const logEmitter = new events.EventEmitter();

function ensureSshKey() {
    const sshDir = path.join(os.homedir(), '.ssh');
    const keyPath = path.join(sshDir, 'id_rsa');
    if (!fs.existsSync(sshDir)) fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(keyPath)) {
        execSync(`ssh-keygen -t rsa -b 4096 -f "${keyPath}" -N ""`, { stdio: 'ignore' });
    }
    return fs.readFileSync(`${keyPath}.pub`, 'utf8');
}

const server = http.createServer((req, res) => {
    // Permitir CORS y HEAD para evitar errores 404 en chequeos de navegador
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS' || req.method === 'HEAD') {
        res.writeHead(200);
        return res.end();
    }

    // API: Configuración Global
    if (req.url === '/api/settings' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(globalSettings));
        return;
    }

    if (req.url === '/api/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newSet = JSON.parse(body);
                globalSettings = { ...globalSettings, ...newSet };
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(globalSettings, null, 2));
                logEmitter.emit('log', { type: 'system', message: `Ajuste global: ${JSON.stringify(globalSettings)}` });
                res.writeHead(200); res.end(JSON.stringify({ status: 'success' }));
            } catch(e) {
                res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inválido' }));
            }
        });
        return;
    }

    // API: Configuración y Sincronización
    if (req.url === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const config = JSON.parse(body);
            const originalSessionName = config.session_name || 'gemini-bridge';
            // Mutagen doesn't allow spaces in session names
            const validSessionName = originalSessionName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
            const configFile = path.join(CONFIGS_DIR, `${originalSessionName}.json`);
            
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
            logEmitter.emit('log', { type: 'system', message: `Configurando sesión: ${originalSessionName} (ID: ${validSessionName})` });

            const pubKey = ensureSshKey();
            const conn = new Client();
            
            conn.on('ready', () => {
                logEmitter.emit('log', { type: 'system', message: 'SSH Conectado. Instalando clave...' });
                const setupCmd = `mkdir -p ~/.ssh && echo "${pubKey.trim()}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh`;
                
                conn.exec(setupCmd, (err, stream) => {
                    if (err) {
                        res.writeHead(500);
                        return res.end(JSON.stringify({ status: 'error', message: err.message }));
                    }
                    stream.on('close', () => {
                        conn.end();
                        // Agregar a known_hosts para que mutagen no falle por host verification
                        exec(`ssh-keyscan -H ${config.host} >> ~/.ssh/known_hosts`, () => {
                            exec(`mutagen sync terminate "${validSessionName}"`, () => {
                                const mutagenCmd = `mutagen sync create --name="${validSessionName}" "${config.local_path}" "${config.user}@${config.host}:${config.remote_path}" --sync-mode=two-way-resolved`;
                                exec(mutagenCmd, (err2, stdout, stderr) => {
                                    if (err2) {
                                        logEmitter.emit('log', { type: 'error', message: `Mutagen falló: ${stderr || err2.message}` });
                                        res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: stderr || err2.message }));
                                    } else {
                                        logEmitter.emit('log', { type: 'system', message: 'Bridge activo!' });
                                        res.writeHead(200); res.end(JSON.stringify({ status: 'success', message: 'Conectado' }));
                                    }
                                });
                            });
                        });
                    }).resume();
                });
            }).on('error', (err) => {
                res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: err.message }));
            }).connect({ host: config.host, username: config.user, password: config.password });
        });
        return;
    }

    // API: Obtener Sesiones
    if (req.url === '/api/get-configs' && req.method === 'GET') {
        const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
        const configs = {};
        for (const file of files) {
            try {
                configs[file.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf8'));
            } catch(e) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(configs));
        return;
    }

    // API: Logs y SSE
    if (req.url === '/api/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            logEmitter.emit('log', JSON.parse(body));
            res.writeHead(200); res.end('OK');
        });
        return;
    }

    if (req.url === '/api/log-stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        const listener = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
        logEmitter.on('log', listener);
        req.on('close', () => logEmitter.removeListener('log', listener));
        return;
    }

    // API: Test SSH
    if (req.url === '/api/test-ssh' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const config = JSON.parse(body);
            const conn = new Client();
            conn.on('ready', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success' }));
                conn.end();
            }).on('error', (err) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
            }).connect({ host: config.host, username: config.user, password: config.password, timeout: 5000 });
        });
        return;
    }

    // API: Borrar Sesión
    if (req.url === '/api/delete-session' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { name } = JSON.parse(body);
            const configFile = path.join(CONFIGS_DIR, `${name}.json`);
            if (fs.existsSync(configFile)) {
                fs.unlinkSync(configFile);
                logEmitter.emit('log', { type: 'system', message: `Sesión eliminada: ${name}` });
                res.writeHead(200); res.end(JSON.stringify({ status: 'success' }));
            } else {
                res.writeHead(404); res.end(JSON.stringify({ status: 'error', message: 'No existe la sesión' }));
            }
        });
        return;
    }

    // Listado de directorios (Local y Remoto) - Simplificado
    if (req.url === '/api/ls-local' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { path: p } = JSON.parse(body);
            const target = p || os.homedir();
            try {
                const dirs = fs.readdirSync(target, { withFileTypes: true }).filter(f => f.isDirectory() && !f.name.startsWith('.')).map(f => f.name).sort();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ dirs, current: target }));
            } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
        });
        return;
    }

    if (req.url === '/api/ls-remote' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const config = JSON.parse(body);
            const conn = new Client();
            conn.on('ready', () => {
                conn.sftp((err, sftp) => {
                    const target = config.remote_path || '/';
                    sftp.readdir(target, (err, list) => {
                        if (err) return res.end(JSON.stringify({ error: err.message }));
                        const dirs = list.filter(f => f.attrs.isDirectory() && !f.filename.startsWith('.')).map(f => f.filename).sort();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ dirs, current: target }));
                        conn.end();
                    });
                });
            }).on('error', (err) => { res.writeHead(200); res.end(JSON.stringify({ error: err.message })); }).connect({ host: config.host, username: config.user, password: config.password });
        });
        return;
    }

    if (req.url === '/api/sessions') {
        exec('mutagen sync list', (err, stdout) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ output: stdout || '' }));
        });
        return;
    }

    // Servir Frontend desde la carpeta local del proyecto por ahora
    const projectPublic = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    if (fs.existsSync(projectPublic) && fs.lstatSync(projectPublic).isFile()) {
        const ext = path.extname(projectPublic);
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(projectPublic).pipe(res);
    } else {
        res.writeHead(404); res.end();
    }
});

server.listen(PORT, () => {
    console.log(`[Gemini Bridge Global] running at http://localhost:${PORT}`);
    console.log(`[Storage] Configs in ${CONFIGS_DIR}`);
});
