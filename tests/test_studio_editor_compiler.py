"""Pure compiler checks: no database, accounts, or network access."""
import ast
import re
import unittest
from html import escape
from pathlib import Path
from typing import Tuple

source = Path(__file__).resolve().parents[1] / 'web' / 'builder_manager.py'
node = next(n for n in ast.parse(source.read_text(encoding='utf-8')).body if isinstance(n, ast.FunctionDef) and n.name == 'compile_website_html')
import sys
sys.path.insert(0,str(source.parent))
from studio_formatting import apply_component_formatting, contrast_color
namespace = {'apply_component_formatting':apply_component_formatting,'contrast_color':contrast_color,'Tuple': Tuple, 're': re, 'escape_html': escape}
exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), 'exec'), namespace)
compile_site = namespace['compile_website_html']

class StudioCompilerTests(unittest.TestCase):
    def render(self, components):
        return compile_site({'name':'Test conference','theme_config':{'mode':'light'},'schema_json':components})[0]

    def test_custom_html_is_isolated_and_escaped(self):
        html = self.render([{'type':'custom','data':{'html':'<script>alert(1)</script><h2>Hi</h2>', 'height':99999}}])
        self.assertIn('sandbox=""', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertIn('height:2000px', html)

    def test_styles_are_bounded_and_invalid_css_rejected(self):
        html = self.render([{'type':'footer','data':{},'studio_style':{'padding':999,'radius':-4,'background':'red;position:fixed'}}])
        self.assertIn('style="padding:160px;border-radius:0px"', html)
        self.assertNotIn('red;position:fixed', html)

    def test_styles_and_order_survive_compilation(self):
        html = self.render([{'type':'custom','data':{'html':'FIRST'},'studio_style':{'background':'#abcdef','padding':24}}, {'type':'footer','data':{'brand_name':'SECOND'}}])
        self.assertLess(html.index('srcdoc="FIRST"'), html.index('SECOND'))
        self.assertIn('padding:24px;background:#abcdef', html)

    def test_hero_designs_keep_content(self):
        for variant in ('split','centered','image_left','image_top','text_only','conference_program'):
            with self.subTest(variant=variant):
                html = self.render([{'type':'hero','data':{'layout_variant':variant,'headline':'Keep my headline','hero_image':'https://example.com/photo.jpg'}}])
                self.assertIn('Keep my headline',html)
                if variant != 'conference_program': self.assertIn('hero-design-'+variant,html)

    def test_conference_content_sections_and_designs(self):
        for kind in ('about','stats','agenda','sponsors','testimonials','announcement'):
            for design in ('grid','list','spotlight'):
                with self.subTest(kind=kind,design=design):
                    html = self.render([{'type':kind,'data':{'design':design,'section_title':'My event','items':[{'title':'<script>bad</script>','description':'Details','image':'javascript:alert(1)'}]}}])
                    self.assertIn('design-'+design,html)
                    self.assertIn('My event',html)
                    self.assertIn('&lt;script&gt;bad&lt;/script&gt;',html)
                    self.assertNotIn('javascript:alert(1)',html)

    def test_hidden_sections_are_omitted_without_affecting_visible_sections(self):
        html = self.render([{'type':'about','hidden':True,'data':{'section_title':'PRIVATE HIDDEN CONTENT'}}, {'type':'about','data':{'section_title':'Visible content'}}])
        self.assertNotIn('PRIVATE HIDDEN CONTENT',html)
        self.assertIn('Visible content',html)

    def test_compiled_text_formatting_and_white_background(self):
        html=self.render([{'type':'about','data':{'section_title':'My conference'},'studio_style':{'background':'#ffffff'},'field_formats':{'["section_title"]':{'style':{'size':36,'color':'#ffffff'}}}}])
        self.assertIn('font-size:36px;color:#172033',html)
        self.assertIn('studio-auto-contrast',html)

    def test_embedded_image_section_and_alt_text(self):
        html=self.render([{'type':'image','data':{'image_url':'data:image/webp;base64,AAAA','caption':'Venue'},'image_formats':{'["image_url"]':{'alt':'Main hall','fit':'contain'}}}])
        self.assertIn('data:image/webp;base64,AAAA',html)
        self.assertIn('alt="Main hall"',html)
        self.assertIn('object-fit:contain',html)

if __name__ == '__main__': unittest.main()
