#!/usr/bin/env python3
"""Gera models/mavic3.glb.js (GLB em base64) para o site funcionar abrindo index.html direto (file://).
Rode de novo sempre que trocar models/mavic3.glb:   python tools/glb-to-js.py"""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
glb = (root / "models" / "mavic3.glb").read_bytes()
js = 'window.MAVIC3_GLB_BASE64 = "' + base64.b64encode(glb).decode() + '";\n'
(root / "models" / "mavic3.glb.js").write_text(js)
print("OK:", len(js) // 1024, "KB -> models/mavic3.glb.js")
