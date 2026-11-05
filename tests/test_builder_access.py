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
        names = {'_require_owned_site', 'serve_public_website'}
        functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        for n in functions:
            n.decorator_list = []
        self.site = {'user_email':'owner@example.test','status':'draft','compiled_html':'<h1>Test</h1>'}
        self.scope = {'re':re,'HTTPException':HTTPException,'HTMLResponse':HTMLResponse,
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
