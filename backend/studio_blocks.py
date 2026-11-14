"""Embed the shared native-element runtime into portable published HTML."""
import json
from pathlib import Path

RUNTIME = '\n'.join((Path(__file__).parent / 'static' / name).read_text(encoding='utf-8') for name in ('studio-formatting.js','studio-blocks.js'))

def render_native_blocks(data):
    payload = json.dumps(data, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    return '<div class="sci-native-host"></div><script type="application/json" data-sci-native>' + payload + '</script>'

def native_runtime():
    return '<script>' + RUNTIME + '\nif(!document.getElementById("sci-native-style")){const s=document.createElement("style");s.id="sci-native-style";s.textContent=StudioBlocks.css;document.head.append(s);}StudioBlocks.hydrate();</script>'
