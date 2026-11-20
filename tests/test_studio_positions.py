import unittest
from backend.studio_formatting import apply_component_formatting

class PositionsTest(unittest.TestCase):
 def test_button_moves_whole_anchor(self):
  comp={"data":{"cta_label":"Go"},"item_positions":{'["cta_label"]':{"x":20,"y":10}}}
  html=apply_component_formatting('<a href="#contact">Go</a>',comp)
  self.assertIn('<a href="#contact" style="position:relative;',html)
  self.assertIn('--sci-position-x:20px',html)
  self.assertIn('@media(max-width:600px)',html)
 def test_image_position_and_limits(self):
  comp={"data":{"logo_url":"/logo.png"},"item_positions":{'["logo_url"]':{"x":99999,"y":-99999}}}
  html=apply_component_formatting('<img src="/logo.png" alt="Logo">',comp)
  self.assertIn('--sci-position-x:2000px',html)
  self.assertIn('--sci-position-y:-2000px',html)
 def test_without_positions_retains_content(self):
  self.assertEqual(apply_component_formatting('<p>Hello</p>',{"data":{"text":"Hello"}}),'<p>Hello</p>')

class DimensionsTest(unittest.TestCase):
 def test_size_and_layers_survive_compilation(self):
  comp={"data":{"headline":"Hello"},"item_positions":{'["headline"]':{"x":4,"y":8,"width":240,"height":80,"z":12}}}
  html=apply_component_formatting('<h1>Hello</h1>',comp)
  for rule in ('width:240px','height:80px','z-index:12','width:auto!important'):
   self.assertIn(rule,html)

class NavbarFlowTest(unittest.TestCase):
 def test_flow_ignores_old_offsets_but_free_mode_keeps_them(self):
  comp={"type":"navbar","data":{"cta_label":"Go"},"item_positions":{'["cta_label"]':{"x":-63,"y":4}}}
  self.assertNotIn('translate:',apply_component_formatting('<a>Go</a>',comp))
  comp["data"]["nav_flow"]=False
  self.assertIn('--sci-position-x:-63px',apply_component_formatting('<a>Go</a>',comp))
