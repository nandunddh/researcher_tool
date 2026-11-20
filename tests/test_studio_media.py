import ast
import asyncio
import re
import tempfile
import unittest
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from fastapi.responses import FileResponse

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class FakeRequest:
    def __init__(self, body: bytes, length: Optional[str] = None):
        self.body = body
        self.headers = {"content-length": length if length is not None else str(len(body))}

    async def stream(self):
        for i in range(0, len(self.body), 7):
            yield self.body[i:i + 7]


class StudioMediaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        tree = ast.parse((Path(__file__).resolve().parents[1] / "backend/app.py").read_text(encoding="utf-8"))
        names = {"_sniff_image", "builder_upload_media", "builder_serve_media"}
        nodes = []
        for n in tree.body:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names:
                n.decorator_list = []
                nodes.append(n)
            elif isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id.startswith("MEDIA_") for t in n.targets):
                nodes.append(n)
        self.owned = []
        self.scope = {
            "re": re, "Path": Path, "Optional": Optional, "HTTPException": HTTPException, "FileResponse": FileResponse,
            "Request": object,
            "_require_authenticated_user": lambda req: {"client_email": "owner@example.test"},
            "_require_scistudio_access": lambda user: None,
            "_require_owned_site": lambda sid, user: self.owned.append(sid),
            "_media_dir": lambda sid: root / sid,
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "<media-tests>", "exec"), self.scope)

    def tearDown(self):
        self.tmp.cleanup()

    def upload(self, body: bytes, length: Optional[str] = None):
        return asyncio.run(self.scope["builder_upload_media"]("site_1234abcd", FakeRequest(body, length)))

    def test_png_upload_is_stored_and_served(self):
        result = self.upload(PNG)
        self.assertEqual(self.owned, ["site_1234abcd"])
        self.assertRegex(result["url"], r"^/api/builder/media/site_1234abcd/[a-f0-9]{32}\.png$")
        name = result["url"].rsplit("/", 1)[1]
        response = asyncio.run(self.scope["builder_serve_media"]("site_1234abcd", name))
        self.assertEqual(response.media_type, "image/png")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_type_comes_from_content_not_the_client(self):
        for body in (b"<svg onload=alert(1)>", b"<html>", b"GIF8"):
            with self.assertRaises(HTTPException) as error:
                self.upload(body)
            self.assertEqual(error.exception.status_code, 415)

    def test_size_limits_and_empty_files(self):
        limit = self.scope["MEDIA_MAX_BYTES"]
        with self.assertRaises(HTTPException) as error:
            self.upload(PNG, length=str(limit + 1))
        self.assertEqual(error.exception.status_code, 413)
        with self.assertRaises(HTTPException) as error:
            self.upload(PNG + b"\x00" * limit, length="10")  # lying header is still caught
        self.assertEqual(error.exception.status_code, 413)
        with self.assertRaises(HTTPException) as error:
            self.upload(b"")
        self.assertEqual(error.exception.status_code, 400)

    def test_serving_rejects_unsafe_names(self):
        serve = self.scope["builder_serve_media"]
        for site, name in (("site_1234abcd", "../licenses.json"), ("../x", "a" * 32 + ".png"),
                           ("site_1234abcd", "a" * 32 + ".svg"), ("site_1234abcd", "a" * 32 + ".png")):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(serve(site, name))
            self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
