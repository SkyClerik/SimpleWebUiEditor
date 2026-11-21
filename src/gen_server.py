import http.server
import socketserver
import json
import threading
import queue
import io
import zipfile
import os
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent

def find_project_root() -> Path:
    for candidate in (SCRIPT_DIR, SCRIPT_DIR.parent):
        if (candidate / 'documents').exists() or (candidate / 'Free Web UI Builder').exists():
            return candidate
    return SCRIPT_DIR.parent if SCRIPT_DIR.name == 'src' else SCRIPT_DIR

BASE_DIR = find_project_root()
PORT = int(os.environ.get('PORT', 8000))
LOG_FILE = BASE_DIR / 'browser_errors.log'

DOCUMENTS_DIR = BASE_DIR / 'documents'
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

STYLESHEETS_DIR = BASE_DIR / 'stylesheets'
STYLESHEETS_DIR.mkdir(parents=True, exist_ok=True)

FRONTEND_DIR = next(
    (p for p in (BASE_DIR / 'Free Web UI Builder', BASE_DIR / 'frontend', SCRIPT_DIR / 'Free Web UI Builder') if p.exists()),
    BASE_DIR / 'Free Web UI Builder'
)

EXPORT_TEMPLATES_DIR = next(
    (p for p in (BASE_DIR / 'export_templates', SCRIPT_DIR / 'export_templates') if p.exists()),
    BASE_DIR / 'export_templates'
)

sse_subscribers = []
sse_lock = threading.Lock()

INJECT_SCRIPT = """
<script>
(function() {
    function sendError(type, data) {
        fetch('/api/error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, url: window.location.href, time: new Date().toISOString(), ...data })
        }).catch(() => {});
    }
    window.addEventListener('error', function(event) {
        if (event.target && (event.target.src || event.target.href)) {
            sendError('RESOURCE_ERROR', { tag: event.target.tagName, src: event.target.src || event.target.href });
        } else {
            sendError('JS_ERROR', { message: event.message, file: event.filename, line: event.lineno, col: event.colno, stack: event.error ? event.error.stack : '' });
        }
    }, true);
    window.addEventListener('unhandledrejection', function(event) {
        sendError('PROMISE_REJECTION', { reason: event.reason ? (event.reason.stack || String(event.reason)) : 'Unknown' });
    });
    const origError = console.error;
    console.error = function(...args) {
        sendError('CONSOLE_ERROR', { message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
        origError.apply(console, args);
    };
})();
</script>
"""

def list_documents():
    docs = []
    if DOCUMENTS_DIR.exists():
        for f in sorted(DOCUMENTS_DIR.iterdir()):
            if f.is_file() and f.name.endswith('.ve.json'):
                doc_name = f.name[:-8]
                docs.append({
                    'name': doc_name,
                    'path': f.name,
                    'size': f.stat().st_size,
                    'modified': datetime.fromtimestamp(f.stat().st_mtime).isoformat()
                })
    return docs

def read_document(name):
    path = DOCUMENTS_DIR / f'{name}.ve.json'
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as fh:
        return json.load(fh)

def save_document(name, data):
    path = DOCUMENTS_DIR / f'{name}.ve.json'
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    broadcast_event('doc:saved', { 'name': name })
    return str(path)

def delete_document(name):
    path = DOCUMENTS_DIR / f'{name}.ve.json'
    if path.exists():
        path.unlink()
        broadcast_event('doc:deleted', { 'name': name })
        return True
    return False

def list_stylesheets():
    sheets = []
    if STYLESHEETS_DIR.exists():
        for f in sorted(STYLESHEETS_DIR.iterdir()):
            if f.is_file() and f.suffix == '.css':
                sheets.append({
                    'name': f.stem,
                    'path': f.name,
                    'size': f.stat().st_size,
                    'modified': datetime.fromtimestamp(f.stat().st_mtime).isoformat()
                })
    return sheets

def read_stylesheet(name):
    safe_name = name.replace('.css', '')
    path = STYLESHEETS_DIR / f'{safe_name}.css'
    if not path.exists():
        return None
    return path.read_text(encoding='utf-8')

def save_stylesheet(name, css_text):
    safe_name = name.replace('.css', '')
    path = STYLESHEETS_DIR / f'{safe_name}.css'
    path.write_text(css_text, encoding='utf-8')
    broadcast_event('css:saved', { 'name': safe_name })
    return str(path)

def delete_stylesheet(name):
    safe_name = name.replace('.css', '')
    path = STYLESHEETS_DIR / f'{safe_name}.css'
    if path.exists():
        path.unlink()
        broadcast_event('css:deleted', { 'name': safe_name })
        return True
    return False

def collect_names(node, doc_name, template_id, doc_ids, global_ids, parent_selector=''):
    name = node.get('name')
    tag = node.get('tag', 'div')
    classes = node.get('classes', [])
    uid = node.get('uid', '')
    if not name:
        return
    class_str = '.' + '.'.join(classes) if classes else ''
    selector = parent_selector + (' > ' if parent_selector else '') + tag + class_str
    doc_ids[name] = { 'selector': selector, 'tag': tag, 'uid': uid, 'doc': doc_name }
    if name not in global_ids:
        global_ids[name] = { 'selector': selector, 'tag': tag, 'uid': uid, 'doc': doc_name }
    for child in node.get('children', []):
        collect_names(child, doc_name, template_id, doc_ids, global_ids, selector)

def generate_binding(project_name='default'):
    binding = {
        '$schema': 'ui-binding/1.0',
        'project': project_name,
        'generated': datetime.now().isoformat(),
        'documents': {},
        'ids': {},
        'assets': {}
    }
    docs = list_documents()
    for doc_info in docs:
        doc_name = doc_info['name']
        doc_data = read_document(doc_name)
        if not doc_data or 'root' not in doc_data:
            continue
        template_id = f'asset_{doc_name}'
        binding['assets'][doc_name] = template_id
        doc_ids = {}
        collect_names(doc_data['root'], doc_name, template_id, doc_ids, binding['ids'])
        binding['documents'][doc_name] = {
            'template': template_id,
            'stylesheets': doc_data.get('stylesheets', []),
            'elements': doc_ids
        }
    return binding

def broadcast_event(event, data):
    msg = json.dumps({ 'event': event, 'data': data }, ensure_ascii=False)
    with sse_lock:
        dead = []
        for queue_item in sse_subscribers:
            try:
                queue_item.put(msg)
            except:
                dead.append(queue_item)
        for q in dead:
            sse_subscribers.remove(q)

class Handler(http.server.SimpleHTTPRequestHandler):
    def send_file(self, file_path):
        content_type = 'application/octet-stream'
        if file_path.suffix == '.html': content_type = 'text/html; charset=utf-8'
        elif file_path.suffix == '.css': content_type = 'text/css; charset=utf-8'
        elif file_path.suffix == '.js': content_type = 'application/javascript; charset=utf-8'
        elif file_path.suffix == '.json': content_type = 'application/json; charset=utf-8'
        elif file_path.suffix == '.png': content_type = 'image/png'
        elif file_path.suffix == '.svg': content_type = 'image/svg+xml'

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (ConnectionAbortedError, BrokenPipeError, OSError):
            pass

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (ConnectionAbortedError, BrokenPipeError, OSError):
            pass

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/export/'):
            raw_part, _, query_str = path.removeprefix('/api/export/').partition('?')
            project_name = raw_part or 'default'
            requested_doc = ''
            for pair in query_str.split('&'):
                if pair.startswith('doc='):
                    requested_doc = pair.removeprefix('doc=')

            binding = generate_binding(project_name)
            docs_bundle = {}
            sheets_bundle = {}
            tpl_dir = EXPORT_TEMPLATES_DIR

            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(f'{project_name}_binding.json', json.dumps(binding, ensure_ascii=False, indent=2))

                if DOCUMENTS_DIR.exists():
                    for f in sorted(DOCUMENTS_DIR.iterdir()):
                        if f.is_file() and f.name.endswith('.ve.json'):
                            zf.write(f, arcname=f'documents/{f.name}')
                            try:
                                docs_bundle[f.name.removesuffix('.ve.json')] = json.loads(f.read_text(encoding='utf-8'))
                            except Exception:
                                pass

                if STYLESHEETS_DIR.exists():
                    for f in sorted(STYLESHEETS_DIR.iterdir()):
                        if f.is_file() and f.suffix == '.css':
                            zf.write(f, arcname=f'stylesheets/{f.name}')
                            sheets_bundle[f.stem] = f.read_text(encoding='utf-8')

                ve_runtime = FRONTEND_DIR / 'js' / 'core' / 'VisualElement.js'
                if ve_runtime.exists():
                    zf.write(ve_runtime, arcname='runtime/VisualElement.js')

                bundle_js = 'window.VE_BUNDLE = ' + json.dumps({'documents': docs_bundle, 'stylesheets': sheets_bundle}, ensure_ascii=False) + ';\n'
                zf.writestr('runtime/bundle.js', bundle_js)

                first_doc = requested_doc if requested_doc in docs_bundle else ('main' if 'main' in docs_bundle else next(iter(docs_bundle.keys()), 'main'))
                other_docs = [d for d in docs_bundle.keys() if d != first_doc]
                template_doc = other_docs.pop(0) if other_docs else first_doc

                all_ids = binding.get('ids', {})
                doc_buttons = [k for k, v in all_ids.items() if v.get('doc') == first_doc and v.get('tag') == 'button']
                doc_containers = [k for k, v in all_ids.items() if v.get('doc') == first_doc and v.get('tag') == 'div']

                demo_btn_id = doc_buttons.pop(0) if doc_buttons else next(iter(all_ids.keys()), 'BTN_Submit')
                demo_container_id = doc_containers.pop(0) if doc_containers else 'root'
                ids_section = '\n'.join([f'- {k} (<{v["tag"]}> в {v["doc"]}.ve.json)' for k, v in all_ids.items()]) or 'Нет именованных элементов.'

                replacements = {
                    '{{PROJECT_NAME}}': project_name,
                    '{{FIRST_DOC}}': first_doc,
                    '{{TEMPLATE_DOC}}': template_doc,
                    '{{DEMO_BTN_ID}}': demo_btn_id,
                    '{{DEMO_CONTAINER_ID}}': demo_container_id,
                    '{{ALL_IDS_JSON}}': json.dumps(list(all_ids.keys()), ensure_ascii=False),
                    '{{IDS_SECTION}}': ids_section
                }

                for tpl_name in ('index.html', 'app_logic.js', 'start_preview.bat', 'README.md'):
                    tpl_file = tpl_dir / tpl_name
                    if tpl_file.exists():
                        content = tpl_file.read_text(encoding='utf-8')
                        for key, val in replacements.items():
                            content = content.replace(key, val)
                        zf.writestr(tpl_name, content)

            zip_bytes = buf.getvalue()
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{project_name}_ui_bundle.zip"')
            self.send_header('Content-Length', str(len(zip_bytes)))
            self.end_headers()
            self.wfile.write(zip_bytes)
            return

        if path == '/api/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            msg_queue = queue.Queue()
            with sse_lock:
                sse_subscribers.append(msg_queue)
            try:
                while True:
                    msg = msg_queue.get(timeout=30)
                    try:
                        self.wfile.write(f'data: {msg}\n\n'.encode('utf-8'))
                    except (ConnectionAbortedError, BrokenPipeError, OSError):
                        break
            except:
                pass
            finally:
                with sse_lock:
                    if msg_queue in sse_subscribers:
                        sse_subscribers.remove(msg_queue)
            return

        if path == '/api/documents':
            self.send_json(200, { 'documents': list_documents() })
            return

        if path.startswith('/api/documents/'):
            name, _, _ = path.removeprefix('/api/documents/').partition('?')
            if name:
                data = read_document(name)
                if data:
                    self.send_json(200, { 'name': name, 'data': data })
                else:
                    self.send_json(404, { 'error': 'Document not found' })
                return

        if path == '/api/stylesheets':
            self.send_json(200, { 'stylesheets': list_stylesheets() })
            return

        if path.startswith('/api/stylesheets/'):
            name, _, _ = path.removeprefix('/api/stylesheets/').partition('?')
            if name:
                css_text = read_stylesheet(name)
                if css_text is not None:
                    self.send_json(200, { 'name': name.replace('.css', ''), 'css': css_text })
                else:
                    self.send_json(404, { 'error': 'Stylesheet not found' })
                return

        if path.startswith('/stylesheets/'):
            name, _, _ = path.removeprefix('/stylesheets/').partition('?')
            css_file = STYLESHEETS_DIR / name
            if css_file.exists() and css_file.is_file():
                self.send_file(css_file)
                return

        if path.startswith('/api/build/'):
            parts, _, _ = path.removeprefix('/api/build/').partition('?')
            if parts:
                binding = generate_binding(parts)
                bp = DOCUMENTS_DIR / f'{parts}_binding.json'
                with open(bp, 'w', encoding='utf-8') as fh:
                    json.dump(binding, fh, ensure_ascii=False, indent=2)
                broadcast_event('build:completed', { 'project': parts, 'path': bp.name })
                self.send_json(200, { 'status': 'ok', 'project': parts, 'binding': binding })
                return

        if path in ('/', '/index.html'):
            idx = FRONTEND_DIR / 'index.html'
            if idx.exists():
                html = idx.read_text(encoding='utf-8', errors='replace')
                head_tag = '<' + 'head>'
                if head_tag in html:
                    html = html.replace(head_tag, head_tag + INJECT_SCRIPT, 1)
                else:
                    html = INJECT_SCRIPT + html
                encoded = html.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
                return

        rel_path = path.lstrip('/')
        target_file = FRONTEND_DIR / rel_path
        if target_file.exists() and target_file.is_file():
            self.send_file(target_file)
            return

        self.send_json(404, { 'error': 'Not found' })


    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        cl = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(cl).decode('utf-8', errors='replace')

        if path == '/api/error':
            try:
                err = json.loads(body)
                ts = datetime.now().strftime('%H:%M:%S')
                log_msg = f'\n[BROWSER {err.get("type")}] {ts}\n'
                for k, v in err.items():
                    if k not in ('type', 'time') and v:
                        log_msg += f'  {k}: {v}\n'
                print(f'\033[91m{log_msg}\033[0m', end='')
                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    f.write(log_msg)
            except Exception as e:
                print(f'Ошибка разбора лога: {e}')
            self.send_json(200, { 'status': 'logged' })
            return

        if path == '/api/documents':
            try:
                req = json.loads(body)
                save_document(req['name'], req['data'])
                self.send_json(200, { 'status': 'ok', 'name': req['name'] })
            except Exception as e:
                self.send_json(400, { 'error': str(e) })
            return

        if path.startswith('/api/documents/') and path.endswith('/save'):
            name = path.removeprefix('/api/documents/').removesuffix('/save')
            try:
                req = json.loads(body)
                save_document(name, req)
                self.send_json(200, { 'status': 'ok', 'name': name })
            except Exception as e:
                self.send_json(400, { 'error': str(e) })
            return

        if path == '/api/stylesheets':
            try:
                req = json.loads(body)
                save_stylesheet(req['name'], req.get('css', ''))
                self.send_json(200, { 'status': 'ok', 'name': req['name'] })
            except Exception as e:
                self.send_json(400, { 'error': str(e) })
            return

        if path == '/api/build':
            try:
                req = json.loads(body) if body else { 'project_name': 'default' }
                pname = req.get('project_name', 'default')
                binding = generate_binding(pname)
                bp = DOCUMENTS_DIR / f'{pname}_binding.json'
                with open(bp, 'w', encoding='utf-8') as fh:
                    json.dump(binding, fh, ensure_ascii=False, indent=2)
                broadcast_event('build:completed', { 'project': pname, 'path': bp.name })
                self.send_json(200, { 'status': 'ok', 'project': pname, 'binding': binding })
            except Exception as e:
                self.send_json(400, { 'error': str(e) })
            return

        self.send_json(404, { 'error': 'Not found' })

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/documents/'):
            name, _, _ = path.removeprefix('/api/documents/').partition('?')
            if name:
                if delete_document(name):
                    self.send_json(200, { 'status': 'ok', 'name': name })
                else:
                    self.send_json(404, { 'error': 'Document not found' })
                return

        if path.startswith('/api/stylesheets/'):
            name, _, _ = path.removeprefix('/api/stylesheets/').partition('?')
            if name:
                if delete_stylesheet(name):
                    self.send_json(200, { 'status': 'ok', 'name': name })
                else:
                    self.send_json(404, { 'error': 'Stylesheet not found' })
                return

        self.send_json(404, { 'error': 'Not found' })

if __name__ == '__main__':
    open(LOG_FILE, 'w', encoding='utf-8').close()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print(f'\033[92mServer running: http://localhost:{PORT}\033[0m')
        print(f'Project root: {BASE_DIR}')
        print(f'Frontend:     {FRONTEND_DIR} (found: {FRONTEND_DIR.exists()})')
        print(f'Documents:    {DOCUMENTS_DIR}')
        print(f'Stylesheets:  {STYLESHEETS_DIR}')
        print(f'Templates:    {EXPORT_TEMPLATES_DIR} (found: {EXPORT_TEMPLATES_DIR.exists()})')
        print(f'API: /api/documents, /api/stylesheets, /api/build, /api/events, /api/error')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')
