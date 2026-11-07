import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
import unittest
from fastapi import HTTPException
from fastapi.responses import HTMLResponse

class BuilderAccessTests(unittest.TestCase):
    def setUp(self):
        import re
        tree = ast.parse((Path(__file__).resolve().parents[1]/'web/app.py').read_text(encoding='utf-8'))
        names = {'_require_owned_site', 'serve_public_website', 'builder_preview_site'}
        functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        for n in functions:
            n.decorator_list = []
        self.site = {'user_email':'owner@example.test','status':'draft','compiled_html':'<h1>Test</h1>'}
        self.scope = {'re':re,'HTTPException':HTTPException,'HTMLResponse':HTMLResponse,
                      'Request':object, '_require_authenticated_user':lambda req:req, '_require_scistudio_access':lambda user:None, 'compile_website_html':lambda site:(site['compiled_html'], ''),
                      'builder_engine':SimpleNamespace(get_site=lambda sid:self.site,get_site_by_slug=lambda slug:self.site)}
        exec(compile(ast.Module(body=functions,type_ignores=[]), '<builder-tests>', 'exec'), self.scope)

    def test_owner_admin_and_unrelated_user(self):
        check=self.scope['_require_owned_site']
        self.assertIs(check('site_1234abcd',{'client_email':'owner@example.test'}), self.site)
        self.assertIs(check('site_1234abcd',{'is_admin':True}), self.site)
        with self.assertRaises(HTTPException) as error:
            check('site_1234abcd',{'client_email':'other@example.test'})
        self.assertEqual(error.exception.status_code,404)
        with self.assertRaises(HTTPException):
            check('../secret',{'is_admin':True})

    def test_only_published_site_is_public(self):
        serve=self.scope['serve_public_website']
        self.assertEqual(asyncio.run(serve('example')).status_code,404)
        self.site['status']='published'
        self.assertEqual(asyncio.run(serve('example')).status_code,200)

    def test_owner_can_preview_draft_without_publishing(self):
        preview = self.scope['builder_preview_site']
        response = asyncio.run(preview('site_1234abcd', {'client_email':'owner@example.test'}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(self.site['status'], 'draft')
        with self.assertRaises(HTTPException) as error:
            asyncio.run(preview('site_1234abcd', {'client_email':'other@example.test'}))
        self.assertEqual(error.exception.status_code, 404)
