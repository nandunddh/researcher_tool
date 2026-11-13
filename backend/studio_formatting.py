"""Safe, portable formatting for SciStudio text and image fields."""
import json
import re
from html import escape
from html.parser import HTMLParser

FONTS = {'Inter, sans-serif', 'Outfit, sans-serif', 'Georgia, serif', 'Arial, sans-serif', 'Consolas, monospace'}

def contrast_color(background, preferred=None):
    def luminance(color):
        rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
        rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
        return sum(v*w for v, w in zip(rgb, (.2126, .7152, .0722)))
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', str(background or '')):
        return preferred or '#172033'
    lum = luminance(background)
    if re.fullmatch(r'#[0-9a-fA-F]{6}', str(preferred or '')):
        other = luminance(preferred)
        if (max(lum, other)+.05)/(min(lum, other)+.05) >= 4.5:
            return preferred
    return '#172033' if (lum+.05)/(luminance('#172033')+.05) >= 4.5 else '#ffffff'

def formatting_css(style, background=None):
    if not isinstance(style, dict): return ''
    rules = []
    for key, prop, low, high in [('size','font-size',10,120),('lineHeight','line-height',1,2.5),('radius','border-radius',0,100),('height','height',40,1200)]:
        if key in style:
            try:
                value = min(high, max(low, float(style[key])))
                rules.append(f'{prop}:{value:g}' + ('' if key == 'lineHeight' else 'px'))
            except (ValueError, TypeError): pass
    if style.get('font') in FONTS: rules.append('font-family:'+style['font'])
    if re.fullmatch(r'#[0-9a-fA-F]{6}', str(style.get('color',''))):
        color=contrast_color(background, style['color']) if background else style['color']
        rules.extend(['color:'+color,'-webkit-text-fill-color:'+color])
    for key, prop, options in [('weight','font-weight',{'400','500','600','700','800'}),('italic','font-style',{'normal','italic'}),('decoration','text-decoration',{'none','underline'}),('fit','object-fit',{'cover','contain'}),('position','object-position',{'center','top','bottom','left','right'})]:
        if str(style.get(key,'')) in options: rules.append(prop+':'+str(style[key]))
    if style.get('align') in ('left','center','right'):
        rules.extend(['display:block','text-align:'+style['align']])
    return ';'.join(rules)

def safe_text_link(value):
    return isinstance(value,str) and bool(re.match(r'^(https?://|/(?!/)|#|mailto:|tel:)',value,re.I))

def text_markup(text, formatting, background=None):
    whole = formatting_css(formatting.get('style',{}), background)
    runs = [r for r in formatting.get('runs',[])[:100] if isinstance(r,dict) and isinstance(r.get('start'),int) and isinstance(r.get('end'),int) and 0 <= r['start'] < r['end'] <= len(text)]
    boundaries = sorted({0,len(text),*(r['start'] for r in runs),*(r['end'] for r in runs)})
    parts=[]
    for start,end in zip(boundaries,boundaries[1:]):
        merged={}
        for run in runs:
            if run['start'] <= start and run['end'] >= end: merged.update(run.get('style',{}))
        css=formatting_css(merged,background)
        chunk=escape(text[start:end])
        chunk=f'<span style="{escape(css,quote=True)}">{chunk}</span>' if css else chunk
        if safe_text_link(merged.get('href')):
            chunk=f'<a href="{escape(merged["href"],quote=True)}" style="color:inherit">{chunk}</a>'
        parts.append(chunk)
    result=''.join(parts)
    result=f'<span style="{escape(whole,quote=True)}">{result}</span>' if whole else result
    href=formatting.get('style',{}).get('href')
    if safe_text_link(href) and not any(safe_text_link(run.get('style',{}).get('href')) for run in runs):
        result=f'<a href="{escape(href,quote=True)}" style="color:inherit">{result}</a>'
    return result

def apply_component_formatting(html, comp, background=None):
    fields=[]
    def visit(obj,path):
        if isinstance(obj,dict): iterator=obj.items()
        elif isinstance(obj,list): iterator=enumerate(obj)
        else: return
        for key,value in iterator:
            next_path=path+[str(key)]
            if isinstance(value,str): fields.append((json.dumps(next_path,separators=(',',':')),value))
            elif isinstance(value,(dict,list)): visit(value,next_path)
    visit(comp.get('data',{}),[])
    formats=comp.get('field_formats') or {}
    images=comp.get('image_formats') or {}
    bg=(comp.get('studio_style') or {}).get('background') or background
    class Formatter(HTMLParser):
        def __init__(self): super().__init__(convert_charrefs=True); self.output=[]; self.skip=0
        def handle_starttag(self,tag,attrs):
            if tag in ('script','style','iframe'): self.skip+=1
            if tag=='img':
                source=dict(attrs).get('src','')
                matches=[key for key,value in fields if value==source and key in images]
                if len(matches)==1:
                    extra=formatting_css(images[matches[0]])
                    old=dict(attrs).get('style','')
                    attrs=[(k,v) for k,v in attrs if k not in ('style','alt')]+[('style',old+';'+extra),('alt',str(images[matches[0]].get('alt',dict(attrs).get('alt',''))))]
            self.output.append('<'+tag+''.join(' '+key+(('="'+escape(value,quote=True)+'"') if value is not None else '') for key,value in attrs)+'>')
        def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs)
        def handle_endtag(self,tag):
            if tag in ('script','style','iframe'): self.skip=max(0,self.skip-1)
            self.output.append('</'+tag+'>')
        def handle_data(self,data):
            matches=[key for key,value in fields if value==data and key in formats]
            self.output.append(text_markup(data,formats[matches[0]],None if re.search(r'btn_text|btn_label|cta_label',matches[0]) else bg) if len(matches)==1 and not self.skip else data if self.skip else escape(data))
        def handle_comment(self,data): self.output.append('<!--'+data+'-->')
    parser=Formatter();parser.feed(html);parser.close();return ''.join(parser.output)
