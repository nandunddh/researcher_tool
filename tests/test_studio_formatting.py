import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'web'))
from studio_formatting import contrast_color, formatting_css, text_markup, apply_component_formatting

class FormattingTests(unittest.TestCase):
    def test_contrast_in_both_directions_and_accessible_brand_color(self):
        self.assertEqual(contrast_color('#ffffff','#ffffff'),'#172033')
        self.assertEqual(contrast_color('#000000','#000000'),'#ffffff')
        self.assertEqual(contrast_color('#ffffff','#3344aa'),'#3344aa')
    def test_css_is_bounded_and_allowlisted(self):
        css=formatting_css({'size':900,'font':'evil;display:none','color':'red;position:fixed','fit':'cover','radius':-8})
        self.assertIn('font-size:120px',css)
        self.assertIn('border-radius:0px',css)
        self.assertNotIn('evil',css)
        self.assertNotIn('position:',css)
    def test_unicode_ranges_and_escaping(self):
        html=text_markup('🧬 Hi <',{'style':{'font':'Georgia, serif'},'runs':[{'start':2,'end':4,'style':{'weight':'700'}}]})
        self.assertIn('<span style="font-weight:700">Hi</span>',html)
        self.assertIn('&lt;',html)
    def test_published_field_format_and_image_attributes(self):
        comp={'data':{'headline':'Hello & world','photo':'/photo.png'},'field_formats':{'["headline"]':{'style':{'size':32}}},'image_formats':{'["photo"]':{'fit':'contain','radius':12,'alt':'New description'}}}
        html=apply_component_formatting('<h1>Hello &amp; world</h1><img src="/photo.png" alt="old">',comp)
        self.assertIn('font-size:32px',html)
        self.assertIn('object-fit:contain',html)
        self.assertIn('alt="New description"',html)
    def test_ambiguous_values_are_not_formatted(self):
        comp={'data':{'a':'Same','b':'Same'},'field_formats':{'["a"]':{'style':{'size':32}},'["b"]':{'style':{'size':24}}}}
        self.assertNotIn('font-size',apply_component_formatting('<p>Same</p>',comp))
    def test_text_color_adapts_to_background(self):
        comp={'data':{'headline':'Hello'},'studio_style':{'background':'#ffffff'},'field_formats':{'["headline"]':{'style':{'color':'#ffffff'}}}}
        self.assertIn('color:#172033',apply_component_formatting('<h1>Hello</h1>',comp))
    def test_links_allow_safe_destinations_only(self):
        self.assertNotIn('href=',text_markup('Hello',{'style':{'href':'javascript:alert(1)'}}))
        self.assertIn('href="https://example.com"',text_markup('Hello',{'style':{'href':'https://example.com'}}))
        self.assertIn('href="#contact"',text_markup('Hello',{'runs':[{'start':0,'end':2,'style':{'href':'#contact'}}]}))
if __name__=='__main__':unittest.main()
